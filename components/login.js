import { auth } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCredential } from "firebase/auth";
import { View, Text, TextInput, Button, Alert, StyleSheet, Switch } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage';

const Login = () => {
    const [etunimi, setEtunimi] = useState("")
    const [sukunimi, setSukunimi] = useState("")
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
            AsyncStorage.setItem("etunimi", etunimi);
            AsyncStorage.setItem("sukunimi", sukunimi);
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
    const passwordRef = useRef(null);
    const secondPasswordRef = useRef(null);

    return (
        <View style={{ flex: 1 }}>

            <View style={styles.container}>
                <Text style={styles.label}>
                    {showRegister ? 'Rekisteröidy' : 'Kirjaudu sisään'}
                </Text>

                <Switch
                    trackColor={{ false: '#ccc', true: '#81b0ff' }}
                    thumbColor="#fff"
                    onValueChange={toggleRegister}
                    value={showRegister}
                />

                {showRegister ? (<><Text  >Etunimi</Text>
                    <TextInput
                        onChangeText={setEtunimi}
                        value={etunimi}
                        style={styles.input}
                        returnKeyType='next'
                        onSubmitEditing={() => sukunimiRef.current?.focus()} />
                    <Text  >Sukunimi</Text>
                    <TextInput
                        ref={sukunimiRef}
                        onChangeText={setSukunimi}
                        value={sukunimi}
                        style={styles.input}
                        returnKeyType='next'
                        onSubmitEditing={() => emailRef.current?.focus()} />
                </>) : (<></>)
                }
                <Text  >Sähköposti</Text>
                <TextInput
                    ref={emailRef}
                    onChangeText={setEmail}
                    value={email}
                    style={styles.input}
                    keyboardType='email-address'
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType='next'
                    onSubmitEditing={() => passwordRef.current?.focus()} />
                <Text  >Salasana</Text>
                <TextInput
                    ref={passwordRef}
                    onChangeText={setPassword}
                    value={password}
                    style={styles.input}
                    secureTextEntry
                    returnKeyType={showRegister ? 'next' : 'done'}
                    onSubmitEditing={() => {
                        if (showRegister) {
                            if (!isRegDisabled) {
                                secondPasswordRef.current?.focus();
                            }
                        } else {
                            if (!isLoginDisabled) {
                                kirjaudu();
                            }
                        }
                    }}
                />

                {password.length > 0 && password.length < 7 && (
                    <Text style={{ color: 'red' }}>
                        Salasanan tulee olla vähintään 7 merkkiä
                    </Text>
                )}
                {showRegister ? (<>
                    <Text  >Salasana uudestaan</Text>
                    <TextInput
                        ref={secondPasswordRef}
                        onChangeText={setSecondPassword}
                        value={secondPassword}
                        style={styles.input}
                        secureTextEntry
                        onSubmitEditing={() => {
                            if (!isRegDisabled) {
                                rekisteroidy();
                            } else {
                                Alert.alert('Täytä kaikki kentät oikein');
                            }
                        }}
                    />
                    {secondPassword.length > 0 && secondPassword !== password && (
                        <Text style={{ color: 'red' }}>Salasanat eivät täsmää</Text>
                    )}
                    {isRegDisabled && (
                        <Text style={{ color: 'red' }}>
                            Täytä kaikki kohdat
                        </Text>
                    )}
                    <Button title="Rekisteröidy" onPress={rekisteroidy} disabled={isRegDisabled} />
                </>
                ) : (<>
                    {isLoginDisabled && (
                        <Text style={{ color: 'red' }}>
                            Täytä kaikki kohdat
                        </Text>
                    )}
                    <Button title="Kirjaudu" onPress={kirjaudu} disabled={isLoginDisabled} />
                </>)}


            </View>
        </View>
    )
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