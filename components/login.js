import { auth } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCredential } from "firebase/auth";
import { View, Text, TextInput, Button, Alert, StyleSheet, Switch } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage';

const Login = () => {
    const [etunimi, setEtunimi] = useState("")
    const [sukunimi, setSukunimi] = useState("")
    const [phone, setPhone] = useState("")
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showRegister, setShowRegister] = useState(false)
    const [secondPassword, setSecondPassword] = useState("")

    const kirjaudu = async () => {
        if (isLoginDisabled) return;
        try {
            const res = await signInWithEmailAndPassword(auth, email, password);
            //tietokantatietojen haku
            console.log("Kirjautunut UID:", res.user.uid);
        } catch (e) {
            console.log("Kirjautuminen epäonnistui:", e.message);
            Alert.alert('Kirjautuminen epäonnistui', e.message, [
                { text: 'OK', onPress: () => console.log('OK Pressed') },
            ]);
        }
    };

    const rekisteroidy = async () => {
        if (isRegDisabled) return;
        try {
            const res = await createUserWithEmailAndPassword(auth, email, password);
            await AsyncStorage.setItem("etunimi", etunimi);
            await AsyncStorage.setItem("sukunimi", sukunimi);
            await AsyncStorage.setItem("phone", phone);
            console.log("Rekisteröitynyt UID:", res.user.uid);
            Alert.alert('Rekisteröinti onnistui', 'Käyttäjä on luotu onnistuneesti!', [
                { text: 'OK', onPress: () => console.log('OK Pressed') },
            ]);

        } catch (e) {
            console.log("Rekisteröinti epäonnistui:", e.message);
            Alert.alert('Rekisteröinti epäonnistui', e.message, [
                { text: 'OK', onPress: () => console.log('OK Pressed') },
            ]);
        }
    };

    useEffect(() => {
        setSecondPassword('')
    }, [showRegister])

    const toggleRegister = () => setShowRegister(previousState => !previousState);

    const isLoginDisabled =
        email.length <= 5 ||
        password.length <= 6;

    const isRegDisabled =
        email.length <= 5 ||
        password.length < 7 ||
        secondPassword !== password ||
        etunimi.length <= 2 ||
        sukunimi.length <= 2;

    const sukunimiRef = useRef(null);
    const emailRef = useRef(null);
    const phoneRef = useRef(null)
    const passwordRef = useRef(null);
    const secondPasswordRef = useRef(null);

    return (
        <View style={{ flex: 1 }}>
            <View style={styles.container}>
                {/* Otsikko vaihtuu tilan mukaan */}
                <Text style={styles.label}>
                    {showRegister ? 'Luo uusi tili' : 'Kirjaudu sisään'}
                </Text>

                {/* YKSI painike, jonka teksti vaihtuu. Tämä on vakaampi kuin kaksi eri painiketta. */}
                <Button
                    title={showRegister ? "Onko sinulla jo tili? Kirjaudu" : "Ei vielä tiliä? Rekisteröidy"}
                    onPress={toggleRegister}
                />

                {/* Renderöidään lisäkentät vain jos showRegister on true */}
                {showRegister && (
                    <View style={{ alignItems: 'center' }}>
                        <Text>Etunimi</Text>
                        <TextInput
                            onChangeText={setEtunimi}
                            value={etunimi}
                            style={styles.input}
                            returnKeyType='next'
                            onSubmitEditing={() => sukunimiRef.current?.focus()}
                        />
                        <Text>Sukunimi</Text>
                        <TextInput
                            ref={sukunimiRef}
                            onChangeText={setSukunimi}
                            value={sukunimi}
                            style={styles.input}
                            returnKeyType='next'
                            onSubmitEditing={() => phoneRef.current?.focus()}
                        />
                        <Text>Puhelinnumero</Text>
                        <TextInput
                            ref={phoneRef}
                            onChangeText={setPhone}
                            value={phone}
                            style={styles.input}
                            keyboardType='phone-pad'
                            onSubmitEditing={() => emailRef.current?.focus()}
                        />
                    </View>
                )}

                {/* Nämä kentät näkyvät aina */}
                <Text>Sähköposti</Text>
                <TextInput
                    ref={emailRef}
                    onChangeText={setEmail}
                    value={email}
                    style={styles.input}
                    keyboardType='email-address'
                    autoCapitalize="none"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                />

                <Text>Salasana</Text>
                <TextInput
                    ref={passwordRef}
                    onChangeText={setPassword}
                    value={password}
                    style={styles.input}
                    secureTextEntry
                    onSubmitEditing={() => {
                        if (showRegister) {
                            secondPasswordRef.current?.focus();
                        } else {
                            kirjaudu();
                        }
                    }}
                />

                {/* Rekisteröinnin vahvistus tai kirjautumisnappi */}
                {showRegister ? (
                    <>
                        <Text>Salasana uudestaan</Text>
                        <TextInput
                            ref={secondPasswordRef}
                            onChangeText={setSecondPassword}
                            value={secondPassword}
                            style={styles.input}
                            secureTextEntry
                            onSubmitEditing={() => !isRegDisabled && rekisteroidy()}
                        />
                        <Button title="Rekisteröidy" onPress={rekisteroidy} disabled={isRegDisabled} />
                    </>
                ) : (
                    <Button title="Kirjaudu" onPress={kirjaudu} disabled={isLoginDisabled} />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        marginTop: 100
    },
    input: {
        height: 40,
        width: 150,
        margin: 12,
        borderWidth: 1,
        padding: 10,
    },
    scrollView: {
        backgroundColor: 'pink',

    },
    text: {
        padding: 12,
    },
});

export default Login