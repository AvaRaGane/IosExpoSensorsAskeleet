import { ActivityIndicator, Alert, Button, Modal, Platform, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
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
    try {
      // ODOTETAAN KÄYTTÄJÄÄ
      const user = await odotaKayttajaa();
      if (!user) return;

      // HAETAAN DATA
      const batteryCurrentState = await Battery.getBatteryStateAsync();
      const steps = await getTodaysStepCount();

      // TALLENNETAAN TIETOKANTAAN
      await sendCurrentBatteryStateAndStepsToFirestore(user.uid, batteryCurrentState, steps);

      // LOKITUS 
      await tallennaLokiTietokantaan(`Turvatarkistus. Akku: ${batteryCurrentState}, askeleet: ${steps}`);

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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [modal1Visible, setModal1Visible] = useState(false);
  const [modal2Visible, setModal2Visible] = useState(false);
  const [monitoring, setMonitoring] = useState(null)
  const [subscription, setSubscribtion] = useState(false)

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
      checkFirstTimeInit();
    }
  }, [user])

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

  const checkFirstTimeInit = async () => {
    try {
      const firstTimeInit = await AsyncStorage.getItem('SOLO_FIRST_TIME_INIT');
      if (firstTimeInit !== "false") {
        Alert.alert("Hätä yhteystiedon asetaminen", "Jotta sovellus toimii, täytyy sinun asettaa yhteystiedot avun saamista varten. (HÄTÄVIESTIN LÄHETYS EI OLE VIELÄ KÄYTÖSSÄ!)");
        setShowUserSettings(true);
      }
    } catch (e) {
      console.log("checkFirstTimeInit error", e)
    }
  }

  const saveSOL = async () => {
    try {
      const stateOfSub = await AsyncStorage.getItem('IOS_SOLO_SUBSCRIBE');
      if (stateOfSub === "true") {
        await tallennaSOL();
        await tallennaLokiTietokantaan("Tallennettu SOL tietokantaan manuaalisesti.")
        Toast.show({
          type: 'success',
          text1: 'Elonmerkki lähetetty tietokantaan onnistuneesti'
        });
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
        'IOS_ACTIVATEMONITORING',
        'IOS_SOLO_SUBSCRIBE',
        'phone',
      ]);
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

  const subscribeAutomation = async () => {
    setModal2Visible(false)
    await AsyncStorage.setItem('IOS_SOLO_SUBSCRIBE', 'true');
    Alert.alert("Tilattu", "Onnittelut tilauksesta, voit muokata asetuksissa nyt halutessasi seurannan manuaaliksi.")
  }

  const secondModalButtonHandler = async () => {
    await tallennaSOL();
    await tallennaLokiTietokantaan("Tallennettu SOL tietokantaan manuaalisesti.");
    setModal2Visible(false);
    Toast.show({
      type: 'success',
      text1: 'Elonmerkki lähetetty tietokantaan onnistuneesti'
    });
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

  if (loading) return <ActivityIndicator size="large" style={styles.loadingContainer} />;
  if (!user) return <Login />;
  if (showUserSettings) return <UserSettings setShowUserSettings={setShowUserSettings} monitoring={monitoring} setMonitoring={setMonitoring} subscribtion={subscription} setSubscribtion={setSubscribtion} confirmSubscribe={confirmSubscribe} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Button title="⚙️ ASETUKSET" onPress={() => setShowUserSettings(true)} />
      </View>

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
      {/* --- KESKIOSA: Päätoiminto --- */}
      <View style={styles.centerContent}>
        {(subscription && monitoring) ? (
          // JOS: Tilaus ja seuranta päällä -> Iso teksti
          <View style={styles.monitoringActiveBox}>
            <Text style={styles.monitoringBigText}>
              Automaatti seuraa sinua taustalla...
            </Text>
          </View>
        ) : (
          // MUUTOIN: Ei tilausta tai seuranta pois -> Iso pyöreä nappi
          <TouchableOpacity
            style={styles.bigRoundButton}
            activeOpacity={0.7}
            onPress={saveSOL}
          >
            <Text style={styles.bigRoundButtonText}>LÄHETÄ</Text>
            <Text style={styles.bigRoundButtonSubText}>ELONMERKKI</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* --- ALAOSA: Kirjaudu ulos --- */}
      <View style={styles.bottomBar}>
        <Button title="Kirjaudu ulos" color="#888" onPress={logOutConfirm} />
      </View>
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F2F7'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  topBar: {
    paddingTop: 50, // Nostaa napin ylös (mukauta tarpeen mukaan)
    paddingHorizontal: 20,
    alignItems: 'flex-end', // Asettaa napin oikeaan yläkulmaan
  },
  centerContent: {
    flex: 1, // Keskittää sisällön automaattisesti pystysuunnassa jäljelle jäävään tilaan
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  bottomBar: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  // Iso pyöreä nappi
  bigRoundButton: {
    backgroundColor: '#ff4757', // Huomiota herättävä punainen/pinkki
    width: 220,
    height: 220,
    borderRadius: 110, // Puolet leveydestä tekee täydellisen ympyrän
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8, // Android-varjo
  },
  bigRoundButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  bigRoundButtonSubText: {
    color: '#ffeaa7',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },

  // Automaattiseurannan teksti
  monitoringActiveBox: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#d4edda', // Rauhoittava vihreä tausta
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#c3e6cb',
    width: '100%',
  },
  monitoringBigText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#155724',
    textAlign: 'center',
  },
  stepText: {
    fontSize: 18,
    color: '#28a745',
    fontWeight: '600',
    marginTop: 15,
  }
});