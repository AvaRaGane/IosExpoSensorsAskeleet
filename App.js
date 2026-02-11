import { ActivityIndicator, Alert, Button, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import UserSettings from './components/userSettings';
import Login from './components/login';
import { useEffect, useState } from 'react';
import { kirjauduUlos, lueSOL, tallennaLokiTietokantaan, tallennaSOL } from './components/firestoreService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './components/firebase';
import * as Battery from 'expo-battery';
import AppleHealthKit from 'react-native-health';
import BackgroundService from 'react-native-background-actions';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const fetchTime = () => {
  const now = new Date();
  const pad = (n) => n < 10 ? '0' + n : n;
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)} klo ${pad(now.getHours())}.${pad(now.getMinutes())}`;
}

const writeAsyncLog = async (msg, events = false) => {
  try {
    if (events) {
      const raw = await AsyncStorage.getItem('IOS_NUMB_OF_TRANSACTIONS');
      const earlierEvents = Number(raw) || 0;
      const newEvents = earlierEvents + 1;
      await AsyncStorage.setItem('IOS_NUMB_OF_TRANSACTIONS', String(newEvents));
    }
    const oldLog = JSON.parse((await AsyncStorage.getItem('IOS_ALIVE_LOG')) ?? '[]')
    if (oldLog.length > 30) oldLog.shift();
    oldLog.push({ time: fetchTime(), eventNote: msg });
    await AsyncStorage.setItem('IOS_ALIVE_LOG', JSON.stringify(oldLog));
  } catch (e) {
    console.log(e);
  }
}

const BATTERY_STATES = {
  [Battery.BatteryState.UNKNOWN]: 'UNKNOWN (0)',
  [Battery.BatteryState.UNPLUGGED]: 'UNPLUGGED (1)',
  [Battery.BatteryState.CHARGING]: 'CHARGING (2)',
  [Battery.BatteryState.FULL]: 'FULL (3)',
};

const checkBatterySOL = async () => {
  try {
    console.log("[checkBatterySOL] aloitus")
    const currentState = await Battery.getBatteryStateAsync();
    const lastStateStr = await AsyncStorage.getItem('IOS_ALIVE_LAST_BATTERY_STATE');
    await AsyncStorage.setItem('IOS_ALIVE_LAST_BATTERY_STATE', String(currentState));

    if (!lastStateStr) {
      console.log("[checkBatterySOL] !lastStateStr")
      return false;
    }

    const lastState = parseInt(lastStateStr, 10);

    if (currentState === Battery.BatteryState.UNKNOWN || lastState === Battery.BatteryState.UNKNOWN) {
      console.log("[checkBatterySOL] nykyinen tai edellinen tila UNKNOW")
      return false;
    }

    const isChargingOrFull = (state) =>
      state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;

    if (isChargingOrFull(lastState) && isChargingOrFull(currentState)) {
      console.log("[checkBatterySOL] latauksessa - täynnä")
      return false;
    }

    if (lastState !== currentState) {
      const fromName = BATTERY_STATES[lastState] || lastState;
      const toName = BATTERY_STATES[currentState] || currentState;

      const msg = `BatterySOL: ${fromName} -> ${toName} (User is alive)`;

      console.log(msg);
      await writeAsyncLog(msg, true);
      return true;
    }

  } catch (e) {
    console.log("[checkBatterySOL] error", e);
  }
  return false;
}

const permissions = {
  permissions: {
    read: [AppleHealthKit.Constants.Permissions.StepCount],
  },
};

const getTodaysStepCount = () => {
  return new Promise((resolve) => {
    // 1. Määritellään aikaväli (tämän päivän alku -> nyt)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    console.log("askelia hakemassa, startday:", startOfDay.toISOString())
    const options = {
      startDate: startOfDay.toISOString(),
      endDate: new Date().toISOString(),
      includeManuallyAdded: true, // Lasketaanko käsin lisätyt askeleet mukaan?
    };

    // 2. Varmistetaan init (tämä on turvallista ajaa useasti, se tarkistaa vain luvat)
    AppleHealthKit.initHealthKit(permissions, (initError) => {
      if (initError) {
        console.log("HealthKit init error askelten haussa:", initError);
        resolve(0); // Palautetaan 0, jotta koodi jatkuu nätisti
        return;
      }

      // 3. Haetaan askeleet
      AppleHealthKit.getStepCount(options, (err, results) => {
        if (err) {
          console.log("Virhe askelten haussa:", err);
          resolve(0);
          return;
        }

        // 4. Palautetaan arvo (results.value) tai 0 jos tyhjä
        console.log("HealthKit palautti:", results);
        resolve(results && results.value ? results.value : 0);
      });
    });
  });
}

const sendWarningNotification = async () => {
  await writeAsyncLog("Warning notification sent!");
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Oletko kunnossa?",
      body: "Emme ole havainneet liikettä tänään. Kuittaa elonmerkki sovelluksessa!",
      sound: 'default',
    },
    trigger: null,

  })
}

const veryIntensiveTask = async () => {
  console.log("[Tausta] Palvelu käynnistyi...");
  await writeAsyncLog("Taustapalvelu käynnistetty");

  let isAliveToday = false;

  const raw = await AsyncStorage.getItem('IOS_MORNING_START_HOUR');
  const morningStartHour = raw !== null ? Number(raw) : NaN;
  const startHour = Number.isInteger(morningStartHour) ? morningStartHour : 8;

  const sleepUntilMorning = async () => {
    const now = new Date();
    const targetMorning = new Date();

    targetMorning.setDate(targetMorning.getDate() + 1);
    targetMorning.setHours(startHour, 0, 0, 0);

    const sleepMs = targetMorning.getTime() - now.getTime();

    isAliveToday = false;
    await AsyncStorage.setItem('IOS_IS_ALIVE_TODAY', 'false');
    await writeAsyncLog(
      `Hyvää yötä. Herätys ${Math.round(sleepMs / 1000 / 60 / 60)}h päästä.`
    )
    await tallennaLokiTietokantaan(`Hyvää yötä. Herätys ${Math.round(sleepMs / 1000 / 60 / 60)}h päästä.`);
    return sleepMs;
  }

  await new Promise(async (resolve) => {
    for (let i = 0; BackgroundService.isRunning(); i++) {
      const lastSync = await AsyncStorage.getItem('IOS_LAST_DAY_SYNC');
      const todayStr = new Date().toDateString();

      const now = new Date();
      const currentHour = now.getHours();
      let sleepMs = 15 * 60 * 1000;

      if (currentHour === 20) {
        console.log("[Tausta] Klo 20 tarkistus")
        await writeAsyncLog("Klo 20 tarkistus");

        const eventsRaw = await AsyncStorage.getItem('IOS_ALIVE_EVENTS');
        const eventsToday = Number(eventsRaw) || 0;

        if (eventsToday > 0) {
          if (lastSync !== todayStr) {
            await tallennaSOL("automaatti");
            await AsyncStorage.setItem('IOS_LAST_DAY_SYNC', todayStr);
            await writeAsyncLog(`Tallennettu tietokantaan. Päivän havaintoja yhteensä ${eventsToday}`);
            await tallennaLokiTietokantaan(`SOL tallennettu tietokantaan. Päivän havaintoja yhteensä ${eventsToday}`)
            await AsyncStorage.setItem('IOS_ALIVE_LAST_BATTERY_STATE', "0");
            await AsyncStorage.setItem('IOS_ALIVE_EVENTS', "0");
          }
          sleepMs = await sleepUntilMorning();
        } else {
          await sendWarningNotification();
          await AsyncStorage.setItem('IOS_ALIVE_LAST_BATTERY_STATE', "0");
          await AsyncStorage.setItem('IOS_ALIVE_EVENTS', "0");
          sleepMs = await sleepUntilMorning();
        }
      }

      else if (currentHour >= startHour && currentHour < 20) {
        console.log("Etsitään elonmerkkejä...");

        const batteryActive = await checkBatterySOL()
        if (batteryActive) {
          isAliveToday = true;
          await AsyncStorage.setItem('IOS_IS_ALIVE_TODAY', 'true');
          await writeAsyncLog("Havaittu: Akku", isAliveToday);
          await tallennaLokiTietokantaan("Havaittu: Akku");

          sleepMs = 15 * 60 * 1000;

        } else {
          await tallennaLokiTietokantaan("Ei havaittu muutoksia akun tilassa, seurataan liikettä 30s");

          const motionActive = await getTodaysStepCount();

          if (motionActive > 10) {
            isAliveToday = true;
            await AsyncStorage.setItem('IOS_IS_ALIVE_TODAY', 'true');
            await writeAsyncLog("Havaittu: Liike", isAliveToday);
            await tallennaLokiTietokantaan("Havaittu: Liike");

            sleepMs = 15 * 60 * 1000;

          } else {
            await tallennaLokiTietokantaan("Ei havaittu liikettä, nukutaan 15min ja mitataan uudestaan");
            sleepMs = 15 * 60 * 1000;
          }
        }
      }
      else {
        const targetMorning = new Date();
        if (currentHour > 8) targetMorning.setDate(targetMorning.getDate() + 1);
        targetMorning.setHours(8, 0, 0, 0);
        sleepMs = targetMorning.getTime() - now.getTime();
        isAliveToday = false;
        await AsyncStorage.setItem('IOS_IS_ALIVE_TODAY', 'false');
      }
      // Nukkumissilmukka
      if (sleepMs < 60000) sleepMs = 60000;
      const checkInterval = 10000;
      let sleptTime = 0;
      while (sleptTime < sleepMs) {
        if (!BackgroundService.isRunning()) return;
        await new Promise(r => setTimeout(r, checkInterval));
        sleptTime += checkInterval;
      }
    }
  })
}

const options = {
  taskName: 'ElossaStepCounter',
  taskTitle: 'Elossa-seuranta',
  taskDesc: 'Seuranta aktiivinen',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#ff00ff',
};


export default function App() {
  const [isRunning, setIsRunning] = useState(false)
  const [SOL, setSOL] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [logi, setLogi] = useState([])
  const [statusAlive, setStatusAlive] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [numbOfTransactions, setNumbOfTransactions] = useState(0)
  const [numbOfSteps, setNumbOfSteps] = useState(0)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser ? currentUser : null);
      setLoading(false);
    })
    return unsubscribe;
  }, [])

  useEffect(() => {
    if (user) {
      initNotifications()
      readSOL()
    }
  }, [user])

  useEffect(() => {
    setIsRunning(BackgroundService.isRunning());
    console.log("useEffect [], seuranta:",BackgroundService.isRunning())
    fetchNumbOfTransactions().then(setNumbOfTransactions);
  }, [])

  const readSOL = async () => {
    try {
      setSOL(await lueSOL());
      const aliveStatus = await AsyncStorage.getItem('IOS_IS_ALIVE_TODAY');
      setStatusAlive(aliveStatus === 'true')
      fetchNumbOfTransactions().then(setNumbOfTransactions);
    } catch (e) {
      console.log(e);
    }
  }

  const saveSOL = async () => {
    try {
      await tallennaSOL();
    } catch (e) {
      console.log(e)
    }
  }

  const initNotifications = async () => {
    if (Platform.OS === 'ios') {
      try {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowSound: true,
            allowBadge: true,
          },
        });

        if (status !== 'granted') {
          console.log('Ilmoituslupaa ei myönnetty');
        }
      } catch (e) {
        console.log(e)
      }
    }
  }

  // startBackgroundService()
  const startBackgroundService = async () => {
    console.log("startBackgroundService-functiossa")
    if (BackgroundService.isRunning()) {
      console.log("BackgroundService.isRunning() true")
      setIsRunning(true);
      return
    }
    console.log("BackgroundService.isRunning() false")

    AppleHealthKit.initHealthKit(permissions, async (error) => {
      if (error) {
        console.log("HealthKit error:", error);
        Alert.alert("Virhe", "Terveystietojen (HealthKit) alustus epäonnistui. Tarkista oikeudet asetuksista.");
        return;
      }
      console.log("initHealthKit ei erroria")
      try {
        await BackgroundService.start(veryIntensiveTask, options);
        await BackgroundService.updateNotification({ taskDesc: 'Seuranta päällä' });
        setIsRunning(true);
        console.log("seuranta pitäisi olla päällä!")
      } catch (e) {
        console.log(e);
        Alert.alert("Virhe", "Palvelu ei käynnistynyt: " + e.message);
      }
    });
  }

  const stopBackgroundService = async () => {
    await BackgroundService.stop();
    setIsRunning(false);
  }

  const fetchLog = async () => {
    let askeleet = await getTodaysStepCount();
    setNumbOfSteps(askeleet);
    console.log("Askeleiden määrä", askeleet);
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

  //userLogOut()
  const userLogOut = async () => {
    try {
      if (BackgroundService.isRunning()) {
        await BackgroundService.stop();
        setIsRunning(false);
      }
      await AsyncStorage.multiRemove([
        'IOS_IS_ALIVE_TODAY',
        'IOS_LAST_DAY_SYNC'
      ]);

      setSOL(null);
      setLogi([])
      setStatusAlive(false)

      await kirjauduUlos();

      console.log("uloskirjautuminen onnistui")
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
      numb = parseInt(await AsyncStorage.getItem('IOS_NUMB_OF_TRANSACTIONS'));
    } catch (e) {
      console.log("fetchNumbOfTransactions ei onnistunut", e)
    }
    console.log("fetchNumbOfTransactions arvolla", numb)
    return numb;
  }

  if (loading) return <ActivityIndicator size="large" style={styles.loadingContainer} />
  if (!user) return <Login />;
  if (showUserSettings) return <UserSettings setShowUserSettings={setShowUserSettings} />

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Button title="Asetukset" onPress={() => setShowUserSettings(true)} />
        {/* --- STATUS KORTTI --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Päivän tilanne</Text>
          <View style={[styles.statusBadge, isRunning ? styles.bgGreen : styles.bgRed]}>
            <Text style={styles.statusText}>
              {isRunning ? "SEURANTA PÄÄLLÄ" : "SEURANTA POIS"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Viimeisin tallennus:</Text>
            <Text style={styles.value}>{SOL ? new Date(SOL).toLocaleString() : '-'}</Text>
          </View>

          {/* UUSI: Näytetään selkeästi onko havainto tehty */}
          <View style={[styles.statusBadge, { marginTop: 10, backgroundColor: statusAlive ? '#d4edda' : '#fff3cd' }]}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>
              {statusAlive ? "✅ ELONMERKKI HAVAITTU" : "⏳ ETSITÄÄN..."}
            </Text>
            <Text style={{ fontSize: 12, color: '#666' }}>
              "Akku ja liike aktiivisessa seurannassa. Tänään tapahtumia {numbOfTransactions} ja askelia {numbOfSteps}"
            </Text>
          </View>
        </View>

        {/* --- PÄÄTOIMINNOT --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hallinta</Text>
          <View style={styles.buttonRow}>
            <View style={styles.flexBtn}>
              <Button title="Käynnistä" onPress={startBackgroundService} disabled={isRunning} />
            </View>
            <View style={styles.flexBtn}>
              <Button title="Sammuta" color="red" onPress={stopBackgroundService} disabled={!isRunning} />
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
              <Button title="Pakota DB tallennus" onPress={saveSOL} color="#6c757d" />
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
