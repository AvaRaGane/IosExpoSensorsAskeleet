import { doc, getDoc, setDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { auth, db, signOut } from './firebase';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const tallennaSOL = async (merkkaaja = "manuaali") => {
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('Ei kirjautunutta käyttäjää');

        const etunimi = await AsyncStorage.getItem('etunimi');
        const sukunimi = await AsyncStorage.getItem('sukunimi');
        const nimi = `${etunimi ?? ''} ${sukunimi ?? ''}`.trim();
        await setDoc(

            doc(db, 'IOS_SOLLIT', uid),
            {
                last_SOL: serverTimestamp(),
                merkkaaja,
                nimi
            },
            { merge: true }
        );
        console.log("Tiedot tallennettu tietokantaan");
    } catch (e) {
        Alert.alert("Virhe tietokantaan tallennuksessa", e);
    }

};

export const lueSOL = async () => {
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('Ei kirjautunutta käyttäjää');

        const snap = await getDoc(doc(db, 'IOS_SOLLIT', uid));
        if (!snap.exists()) {
            console.log("Ei tietoja tietokannassa");
            return null;
        }
        console.log("tietoja haettu tietokannasta, viimeisin SOL:", snap.data().last_SOL?.toMillis() ?? null)
        return snap.data().last_SOL?.toMillis() ?? null;
    } catch (e) {
        Alert.alert("Virhe tietokannasta lukemisessa", e);
        throw e;
    }
};

export const tallennaLokiTietokantaan = async (teksti) => {
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('Ei kirjautunutta käyttäjää');

        const etunimi = await AsyncStorage.getItem('etunimi');
        const sukunimi = await AsyncStorage.getItem('sukunimi');
        const nimi = `${etunimi ?? ''} ${sukunimi ?? ''}`.trim();

        const ref = doc(db, 'IOS_LOKI_SOLLIT', uid);

        await setDoc(
            ref,
            {
                nimi,
                aikaleima: serverTimestamp(),
                lokit: arrayUnion({
                    aika: new Date().toISOString(),
                    teksti
                })
            },
            { merge: true }
        );

        console.log("Loki lisätty");

    } catch (e) {
        console.log("Virhe lokin tallennuksessa", String(e));
    }
};

export const kirjauduUlos = async () => {
    await signOut(auth);
};