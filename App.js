import { ActivityIndicator, Alert, Button, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import UserSettings from './components/userSettings';
import Login from './components/login';
import { useEffect, useState } from 'react';
import { kirjauduUlos, lueSOL, tallennaLokiTietokantaan, tallennaSOL, sendCurrentBatteryStateAndStepsToFirestore } from './components/firestoreService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './components/firebase';
import * as Battery from 'expo-battery';
import AppleHealthKit from 'react-native-health';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import Toast from 'react-native-toast-message';
import messaging from '@react-native-firebase/messaging';

// Apufunktio: Odotetaan että Firebase Auth ehtii herätä
const odotaKayttajaa = () => {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

// Firebase taustakuuntelija
messaging().setBackgroundMessageHandler(async remoteMessage => {
  if (remoteMessage.data && remoteMessage.data.task === "background-fetch-task") {
    const nowStr = new Date().toLocaleTimeString();
    try {
      // ODOTETAAN KÄYTTÄJÄÄ ENNEN TIETOKANTAKUTSUJA
      const user = await odotaKayttajaa();
      if (!user) return;
      // TARKISTETAAN AKUN TILA, ASKELMÄÄRÄ JA TALLENNETAAN NE TIETOKANTAAN
      const batteryCurrentState = await Battery.getBatteryStateAsync();
      const steps = await getTodaysStepCount();
      await sendCurrentBatteryStateAndStepsToFirestore(batteryCurrentState, steps);
      await tallennaLokiTietokantaan("Turvatarkistus. Akku:", batteryCurrentState,"askeleet:",steps);
    } catch (e) {
      console.error("Task error:", e);
      await tallennaLokiTietokantaan(`CRASH: ${e.message}`);
    }
  } else {
    console.log("Saatiin muu taustaviesti, ei tehdä turvatarkistusta:", remoteMessage);
  }
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
  handleSuccess: async (notificationId) => {
    console.log("Taustaviesti käsitelty onnistuneesti:", notificationId);
  },
  handleError: async (notificationId, error) => {
    console.warn("Virhe taustaviestin käsittelyssä:", error);
  }
});

const healthKitOptions = {
  permissions: {
    read: [AppleHealthKit.Constants.Permissions.StepCount],
  },
};

// Funktio askelmäärän hakuun
const getTodaysStepCount = () => {
  return new Promise((resolve) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // HealthKitin init on hyvä tehdä aina ennen hakua taustalla varmuuden vuoksi
    AppleHealthKit.initHealthKit(healthKitOptions, (initError) => {
      if (initError) {
        console.log("HealthKit init error:", initError);
        resolve(0);
        return;
      }

      const options = {
        startDate: startOfDay.toISOString(),
        endDate: new Date().toISOString(),
        includeManuallyAdded: true,
      };

      AppleHealthKit.getStepCount(options, (err, results) => {
        if (err) {
          console.log("Virhe askelten haussa:", err);
          resolve(0);
          return;
        }
        resolve(results && results.value ? results.value : 0);
      });
    });
  });
}

export default function App() {
  const [SOL, setSOL] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logi, setLogi] = useState([]);
  const [statusAlive, setStatusAlive] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [numbOfTransactions, setNumbOfTransactions] = useState(0);
  const [numbOfSteps, setNumbOfSteps] = useState(0);
  const [modal1Visible, setModal1Visible] = useState(false);
  const [modal2Visible, setModal2Visible] = useState(false);
  const [modal3Visible, setModal3Visible] = useState(false);
  const [storageData, setStorageData] = useState({});
  const [monitoring, setMonitoring] = useState(null)
  const [subscribtion, setSubscribtion] = useState(false)

  // Kuunnellaan käyttäjän tilaa
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser ? currentUser : null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Kuunnellaan notifikaatioita etualalla
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      // Jos kyseessä on Firebase Consolen testiviesti (siinä on notification-kenttä)
      if (remoteMessage.notification) {
        Alert.alert(remoteMessage.notification.title, remoteMessage.notification.body);
      }

      // Jos viesti on meidän palvelimen lähettämä hiljainen "Turvatarkistus"
      if (remoteMessage.data && remoteMessage.data.task === "background-fetch-task") {
        tallennaLokiTietokantaan("Turvatarkistus testi (Etuala)");
        // Poistetaan mahdolliset häiriöt ruudulta
        await Notifications.dismissAllNotificationsAsync();
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) {
      registerForPushNotifications();
      readSOL();
      checkFirstTimeInit();
    }
  }, [user])

  useEffect(() => {
    fetchNumbOfTransactions().then(setNumbOfTransactions);
  }, [])

  useEffect(() => {
    const fetchSubAndMonitoringStates = async () => {
      const monitorState = await AsyncStorage.getItem('IOS_ACTIVATEMONITORING');
      const subState = await AsyncStorage.getItem('IOS_SOLO_SUBSCRIBE');
      setMonitoring(monitorState === 'true');
      setSubscribtion(subState === 'true');
    }
    fetchSubAndMonitoringStates();
  }, [])

  useEffect(() => {
    if (monitoring) {
      activateMonitoring();
    }
  }, [monitoring])


  const showStorageData = async () => {
    const values = await AsyncStorage.multiGet([
      'etunimi',
      'IOS_ACTIVATEMONITORING',
      'IOS_ALIVE_LAST_BATTERY_STATE',
      'IOS_ALIVE_LOG',
      'IOS_ICE_MSG',
      'IOS_ICE_NAME',
      'IOS_ICE_PHONE',
      'IOS_IS_ALIVE_TODAY',
      'IOS_NUMB_OF_TRANSACTIONS',
      'IOS_SOLO_SUBSCRIBE',
      'phone',
      'SOLO_FIRST_TIME_INIT',
      'sukunimi'
    ]);

    const data = Object.fromEntries(values);
    setStorageData(data)
    setModal3Visible(true)
  };

  const checkFirstTimeInit = async () => {
    try {
      const firstTimeInit = await AsyncStorage.getItem('SOLO_FIRST_TIME_INIT');
      if (firstTimeInit !== "false") {
        Alert.alert("Yhteystietojen asetukset", "Jotta sovellus toimii, täytyy sinun asettaa yhteystiedot avun saamista varten.");
        setShowUserSettings(true);
      }
    } catch (e) {
      console.log("checkFirstTimeInit error", e)
    }
  }

  const readSOL = async () => {

    try {
      const solli = await lueSOL();
      Toast.show({
        type: 'success',
        text1: `Haettu tietokannasta SOL: ${new Date(solli).toLocaleString()}`
      });
      setSOL(solli);
      const aliveStatus = await AsyncStorage.getItem('IOS_IS_ALIVE_TODAY');
      setStatusAlive(aliveStatus === 'true')
      fetchNumbOfTransactions().then(setNumbOfTransactions);
    } catch (e) {
      console.log(e);
      Toast.show({
        text1: `Ei onnistunut haku: ${e}`
      });
    }
  }

  const saveSOL = async () => {
    try {
      const stateOfSub = await AsyncStorage.getItem('IOS_SOLO_SUBSCRIBE');
      if (stateOfSub === "true") {
        await tallennaSOL();
        await tallennaLokiTietokantaan("Tallennettu SOL tietokantaan manuaalisesti.")
      } else {
        setModal1Visible(true)
      }
    } catch (e) {
      console.log(e)
    }
  }

  const registerForPushNotifications = async () => {
    // 1. Pyydetään luvat
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('Ei lupaa ilmoituksiin!');
      Alert.alert("Huomio", "Ilmoituslupa vaaditaan taustaseurantaa varten!");
      return;
    }

    // 2. KRIITTINEN VAIHE iOS:LLE: Pakotetaan Applen natiivi rekisteröinti
    if (Platform.OS === 'ios') {
      try {
        if (!messaging().isDeviceRegisteredForRemoteMessages) {
          await messaging().registerDeviceForRemoteMessages();
        }

        const apnsToken = await messaging().getAPNSToken();
        console.log("🍏 APNs Token Applelta:", apnsToken);

        if (!apnsToken) {
          Alert.alert("Virhe", "Apple ei antanut laitetokenia! Push ei voi toimia.");
          return;
        }
      } catch (e) {
        console.log("Virhe APNs rekisteröinnissä:", e);
      }
    }

    // 3. Haetaan vasta nyt FIREBASEN token
    const token = await messaging().getToken();

    // 4. Tallenna token tietokantaan
    if (user && user.uid) {
      await setDoc(doc(db, "ios_users", user.uid), {
        pushToken: token,
        email: user.email || "ei_email",
        updatedAt: new Date(),
        last_SOL: serverTimestamp(),
        merkkaaja: "Automaatti, tili luotu",
        subscriber: false
      }, { merge: true });
    }
  };


  const activateMonitoring = async () => {
    console.log("Aktivoidaan seuranta (HealthKit luvat + Push Token)...");

    // HealthKit luvat
    AppleHealthKit.initHealthKit(healthKitOptions, async (error) => {
      if (error) {
        Alert.alert("Virhe", "HealthKit alustus epäonnistui.");
        return;
      }
      console.log("HealthKit OK");

      // 2.  Push Token (kutsuu uudestaan)
      await registerForPushNotifications();

      Alert.alert("Sinua seurataan!", "Palvelin tarkistaa elonmerkkejä taustalla. Mikäli emme havaitse niitä tai puhelimesi on sammunut, lähetämme sinulle ilmoituksen ennen hälyytystä.");
    });
  }

  const fetchLog = async () => {
    let askeleet = await getTodaysStepCount();
    setNumbOfSteps(askeleet);

    fetchNumbOfTransactions().then(setNumbOfTransactions);
    const data = JSON.parse(
      (await AsyncStorage.getItem('IOS_ALIVE_LOG')) ?? '[]'
    );
    setLogi(data);
    const aliveStatus = await AsyncStorage.getItem('IOS_IS_ALIVE_TODAY');
    setStatusAlive(aliveStatus === 'true');
  }

  const eraseLog = async () => {
    try {
      await AsyncStorage.setItem('IOS_ALIVE_LOG', "[]");
      setLogi([]);
    } catch (e) {
      console.log(e)
    }
  }

  const hideLog = () => {
    setLogi([])
  }

  const userLogOut = async () => {
    try {
      await AsyncStorage.multiRemove([
        'IOS_IS_ALIVE_TODAY',
        'IOS_LAST_DAY_SYNC',
        'etunimi',
        'sukunimi',
        'IOS_ICE_NAME',
        'IOS_ICE_PHONE',
        'IOS_ICE_MSG',
        'SOLO_FIRST_TIME_INIT',
        'IOS_NUMB_OF_TRANSACTIONS',
        'IOS_ALIVE_LOG',
        'IOS_ALIVE_LAST_BATTERY_STATE',
        'SOLO_FIRST_TIME_INIT',
      ]);

      setSOL(null);
      setLogi([])
      setStatusAlive(false)

      await kirjauduUlos();
    } catch (e) {
      console.log(e)
    }
  }

  const logOutConfirm = () => {
    Alert.alert(
      "Kirjaudu ulos",
      "Haluatko varmasti kirjautua ulos?",
      [
        { text: "Peruuta", style: "cancel" },
        { text: "Kirjaudu ulos", style: "destructive", onPress: userLogOut },
      ]
    );
  }

  const fetchNumbOfTransactions = async () => {
    let numb = 0
    try {
      const val = await AsyncStorage.getItem('IOS_NUMB_OF_TRANSACTIONS');
      numb = val ? parseInt(val) : 0;
    } catch (e) {
      console.log("fetchNumbOfTransactions ei onnistunut", e)
    }
    return numb;
  }

  const subscribeAutomation = async () => {
    setModal2Visible(false)
    await AsyncStorage.setItem('IOS_SOLO_SUBSCRIBE', 'true');
    Alert.alert("Tilattu", "Onnittelut tilauksesta, voit muokata asetuksissa nyt halutessasi seurannan manuaaliksi.")
  }

  const secondModalButtonHandler = async () => {
    await tallennaSOL();
    await tallennaLokiTietokantaan("Tallennettu SOL tietokantaan manuaalisesti.");
    setModal2Visible(false);
  }

  const confirmSubscribe = async () => {
    await AsyncStorage.setItem('IOS_SOLO_SUBSCRIBE', 'true')
    setSubscribtion(true);
    setMonitoring(false);
    Toast.show({
      type: 'success',
      text1: 'Rahat viety, tilaus tehty',
      text2: 'Voit nyt valita automaattiseurannan ja manuaalin väliltä.'
    });
  }

  const setMonitoringHandler = async () => {
    setMonitoring(true)
    await AsyncStorage.setItem('IOS_ACTIVATEMONITORING', 'true');
    activateMonitoring()
  }


  if (loading) return <ActivityIndicator size="large" style={styles.loadingContainer} />
  if (!user) return <Login />;
  if (showUserSettings) return <UserSettings setShowUserSettings={setShowUserSettings} monitoring={monitoring} setMonitoring={setMonitoring} subscribtion={subscribtion} setSubscribtion={setSubscribtion} confirmSubscribe={confirmSubscribe} />

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Button title="ASETUKSET" onPress={() => setShowUserSettings(true)} />
        <Modal animationType="slide"
          transparent={false}
          visible={modal1Visible}
          onRequestClose={() => { setModal1Visible(!modal1Visible); }}
        >
          <View style={{ flex: 1, marginTop: 50, padding: 20, backgroundColor: '#a2cbf5' }}>
            <Text>Tämän modalin tilalle tulee mainos</Text>


            <Button
              title="Sulje"
              onPress={() => {
                setModal1Visible(false);
                setTimeout(() => {
                  setModal2Visible(true);
                }, 300);
              }}
            />
          </View>
        </Modal>

        <Modal animationType="slide"
          transparent={false}
          visible={modal2Visible}
          onRequestClose={() => { setModal2Visible(!modal2Visible); }}
        >
          <View style={{ flex: 1, marginTop: 50, padding: 20, backgroundColor: '#5df071' }}>
            <Text>Tässä taas kerrotaan että mainokset on ärsyttäviä ja ostamalla tilauksen pääsee niistä eroon.</Text>

            <Button title="Tilaa" onPress={subscribeAutomation} />
            <Button title="Lähetä elonmerkki" onPress={secondModalButtonHandler}
            />
          </View>
        </Modal>
        <Modal animationType="slide"
          transparent={false}
          visible={modal3Visible}
          onRequestClose={() => { setModal3Visible(!modal3Visible); }}
        >
          <View style={{ flex: 1, marginTop: 50, padding: 20, backgroundColor: '#e79f60' }}>
            <Text>AsyncStoragen tiedot</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.modalText}>
                {JSON.stringify(storageData, null, 2)}
              </Text>
            </ScrollView>
            <Button
              title="Sulje"
              onPress={() => setModal3Visible(false)}
            />
          </View>
        </Modal>
        {/* --- STATUS KORTTI --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Päivän tilanne</Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Viimeisin tallennus:</Text>
            <Text style={styles.value}>{SOL ? new Date(SOL).toLocaleString() : '-'}</Text>
          </View>
          {monitoring ? (
            <View
              style={[
                styles.statusBadge,
                {
                  marginTop: 10,
                  backgroundColor: statusAlive ? '#d4edda' : '#fff3cd'
                }
              ]}
            >
              <>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>
                  {statusAlive ? "✅ ELONMERKKI HAVAITTU" : "⏳ ETSITÄÄN..."}
                </Text>

                <Text style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
                  Tänään tapahtumia: {numbOfTransactions} | Askelia: {numbOfSteps}
                </Text>
              </>
            </View>
          ) : subscribtion ? (
            <Button
              title="Aseta automaattiseuranta päälle"
              onPress={setMonitoringHandler}
            />
          ) : (
            <Button
              title="Tee tilaus"
              onPress={confirmSubscribe}
            />
          )}
        </View>

        {/* --- PÄÄTOIMINNOT --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hallinta</Text>
          <Text style={{ marginBottom: 10, color: '#666' }}>
            {monitoring ? "Seuranta on automaattisesti päällä, jos Push-ilmoitukset on sallittu." : "Lähetä elonmerkki manuaalisesti päivittäin, jotta tiedämme sinun olevan turvassa."}
          </Text>

          <View style={styles.buttonRow}>
            <View style={styles.flexBtn}>
              {subscribtion ? (
                monitoring ? (
                  <Text>Seuranta päällä</Text>
                ) : (
                  <Button
                    title="Tarkista Luvat & Aktivoi"
                    onPress={setMonitoringHandler}
                  />
                )
              ) : (
                <Button
                  title="Lähetä elonmerkki manuaalisesti"
                  onPress={saveSOL}
                />
              )}

            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Button title="Kirjaudu ulos" color="#555" onPress={logOutConfirm} />
          </View>

          <View style={[styles.buttonRow, { marginTop: 10 }]}>
            <View style={styles.flexBtn}>
              <Button title="Päivitä näkymä" onPress={fetchLog} color="#6c757d" />
            </View>
            <View style={styles.flexBtn}>
              {monitoring ? (
                <Button
                  title="Lähetä elonmerkki manuaalisesti"
                  onPress={saveSOL}
                  color="#6c757d"
                />
              ) : (
                <Button
                  title="Tee tilaus"
                  onPress={confirmSubscribe}
                />
              )}
            </View>
          </View>
        </View>

        {/* --- LOKI --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tapahtumaloki</Text>
          <View style={styles.buttonRow}>
            <View style={styles.flexBtn}>
              <Button title={logi.length ? "Piilota" : "Hae loki"} onPress={logi.length ? hideLog : fetchLog} />
            </View>
            <View style={styles.flexBtn}>
              <Button title="Tyhjennä" color="orange" onPress={eraseLog} />
            </View>
          </View>

          {logi.length > 0 && (
            <View style={styles.logContainer}>
              {logi.slice().reverse().map((item, index) => (
                <View key={index} style={styles.logRow}>
                  <Text style={styles.logTime}>{item.time}</Text>
                  <Text style={styles.logText}>{item.eventNote}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <Button title="Näytä StorageData" onPress={showStorageData} />
        <Button title="Hae viimeisin SOL" onPress={readSOL} />
        
        <Toast />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F2F7', marginTop: 50 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContainer: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#333' },
  statusBadge: { paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  bgGreen: { backgroundColor: '#d4edda' },
  bgRed: { backgroundColor: '#f8d7da' },
  statusText: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8 },
  label: { fontSize: 16, color: '#555' },
  value: { fontSize: 16, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  flexBtn: { flex: 1, marginHorizontal: 4 },
  logContainer: { marginTop: 12, backgroundColor: '#f1f1f1', borderRadius: 8, padding: 8 },
  logRow: { marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 4 },
  logTime: { fontSize: 12, color: '#666', fontWeight: 'bold' },
  logText: { fontSize: 13, color: '#333' },
});