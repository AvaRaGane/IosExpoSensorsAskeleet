import { View, Text, Button, Modal, TextInput, Alert, Switch, FlatList, TouchableOpacity, StyleSheet } from 'react-native'; import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Contacts from 'react-native-contacts';
import Toast from 'react-native-toast-message';

const UserSettings = ({ setShowUserSettings, monitoring, setMonitoring, subscribtion, setSubscribtion, confirmSubscribe }) => {
    const [ICE_NAME, setICE_NAME] = useState("")
    const [ICE_PHONE, setICE_PHONE] = useState("")
    const [ICE_MSG, setICE_MSG] = useState("")
    const [modalVisible, setModalVisible] = useState(false);
    const [contacts, setContacts] = useState({})
    //const [activateMonitoring, setActivateMonitoring] = useState(null)
    //const [subscribtion, setSubscribtion] = useState(false)
    const [ownName, setOwnName] = useState("")
    const [ownNumber, setOwnNumber] = useState("")
    const [manualMSG, setManualMSG] = useState(false)
    const [saved, setSaved] = useState(true);

    const loadAllSettings = async () => {
        try {
            const values = await AsyncStorage.multiGet([
                'IOS_ICE_NAME',
                'IOS_ICE_PHONE',
                'IOS_ICE_MSG',
                'etunimi',
                'sukunimi',
                'phone',
                //'IOS_SOLO_SUBSCRIBE',
                //'IOS_ACTIVATEMONITORING'
            ]);

            const data = Object.fromEntries(values);

            // ICE
            setICE_NAME(data.IOS_ICE_NAME ?? "");
            setICE_PHONE(data.IOS_ICE_PHONE ?? "");
            setICE_MSG(data.IOS_ICE_MSG ?? "malli");

            // User info
            const fullName =
                data.etunimi && data.sukunimi
                    ? `${data.etunimi} ${data.sukunimi}`
                    : "Matti Mallikas";
            setOwnName(fullName);
            setOwnNumber(data.phone ?? "040-1234567");

            // Booleanit
            //setSubscribtion(data.IOS_SOLO_SUBSCRIBE === 'true');
            //setActivateMonitoring(data.IOS_ACTIVATEMONITORING === 'true');
        } catch (e) {
            console.log(e);
        }
    };

    const isInitialLoad = useRef(true);
    
    useEffect(() => {
        const init = async () => {
            await loadAllSettings();
            setSaved(true);
            isInitialLoad.current = false;
        };
        init();
    }, []);

    useEffect(() => {
        if (isInitialLoad.current) return;
        setSaved(false);
    }, [ICE_NAME, ICE_PHONE, ICE_MSG, monitoring, subscribtion, manualMSG]);

    const requestPermission = async () => {
        const permission = await Contacts.requestPermission();

        if (permission === 'authorized') {
            loadContacts();
        }
    };

    const loadContacts = async () => {
        const userContacts = await Contacts.getAll();
        const contactsWithPhone = userContacts.filter(
            c => c.phoneNumbers && c.phoneNumbers.length > 0
        );
        console.log(contactsWithPhone);
        setContacts(contactsWithPhone);
        setModalVisible(true);
    };

    const tallennaAsetukset = async () => {
        try {
            const name = ["IOS_ICE_NAME", String(ICE_NAME)];
            const phone = ["IOS_ICE_PHONE", String(ICE_PHONE)];
            const msg = ["IOS_ICE_MSG", String(ICE_MSG)];
            const firstTimeInit = ["SOLO_FIRST_TIME_INIT", "false"];
            const sub = ['IOS_SOLO_SUBSCRIBE', String(subscribtion)];
            const monitoringki = ['IOS_ACTIVATEMONITORING', String(monitoring)];
            await AsyncStorage.multiSet(
                [name, phone, msg, firstTimeInit, sub, monitoringki]
            );
            setSaved(true);
            Toast.show({
                type: 'success',
                text1: 'Asetukset tallennettu'
            });
        } catch (error) {
            console.log()
        }
    }

    const closeSettings = async () => {
        if (ICE_NAME?.length > 0 && ICE_PHONE?.length > 0 && ICE_MSG?.length > 0) {
            await AsyncStorage.setItem('SOLO_FIRST_TIME_INIT', 'false')
            if (saved) {
                setShowUserSettings(false)
            } else {
                Alert.alert(
                    'Asetuksia tallentamatta!', 'Haluatko poistua tallentamatta asetuksia?',
                    [
                        { text: "Peruuta", style: "cancel" },
                        { text: "Poistu tallentamatta", style: "destructive", onPress: () => setShowUserSettings(false) },
                    ],
                    { cancelable: false }
                )
            }
        } else {
            Alert.alert('Yhteyshenkilön tiedot antamatta!', 'Anna hätäyhteyshenkilön tiedot ennen kuin poistut.')
        }
    }

    const selectContact = async (contact) => {
        const phone = contact.phoneNumbers[0]?.number;

        setICE_NAME(`${contact.givenName} ${contact.familyName}`);
        setICE_PHONE(phone || "");

        await AsyncStorage.multiSet([
            ["IOS_ICE_NAME", `${contact.givenName} ${contact.familyName}`],
            ["IOS_ICE_PHONE", phone || ""],
        ]);

        setModalVisible(false);
    };

    const cancelSubscribeConfirm = () => {
        Alert.alert(
            "Peru tilaus",
            "Haluatko varmasti perua tilauksen?",
            [
                { text: "En halua perua", style: "cancel" },
                { text: "Peru tilaus", style: "destructive", onPress: cancelSubscribe },
            ]
        );


    }

    const confirmSubscribeConfirm = () => {
        Alert.alert(
            "Tee tilaus",
            "Haluatko varmasti tehdä tilauksen?",
            [
                { text: "Peruuta", style: "cancel" },
                { text: "Tee tilaus", style: "default", onPress: confirmSubscribe },
            ]
        );
    }



    const toggleActivateMonitoring = async () => {
        const state = await AsyncStorage.getItem('IOS_ACTIVATEMONITORING');
        if (state === "true") {
            await AsyncStorage.setItem('IOS_ACTIVATEMONITORING', "false");
            setMonitoring(false);
            Toast.show({
                type: 'success',
                text1: 'Automaatti pois päältä'
            });
        } else {
            await AsyncStorage.setItem('IOS_ACTIVATEMONITORING', "true");
            setMonitoring(true);
            Toast.show({
                type: 'success',
                text1: 'Automaatti seuranta päällä'
            });
        }
    }

    const toggleManualMSG = () => {
        setManualMSG(previousState => !previousState)
    }

    const cancelSubscribe = async () => {
        await AsyncStorage.setItem('IOS_SOLO_SUBSCRIBE', 'false');
        setSubscribtion(false);
        Alert.alert("Tilaus peruttu", 'Nyt tilauksesi on peruttu')
    }

    return (
        <View style={{ marginTop: 80 }}>
            <Modal
                animationType="slide"
                transparent={false}
                visible={modalVisible}
                onRequestClose={() => { setModalVisible(!modalVisible); }}>
                <View style={{ flex: 1, marginTop: 80 }}>
                    <FlatList
                        data={contacts}
                        keyExtractor={(item) => item.recordID}
                        renderItem={({ item }) => {
                            // Näytetään vain kontaktit joilla on numero
                            if (!item.phoneNumbers?.length) return null;
                            return (
                                <TouchableOpacity
                                    onPress={() => selectContact(item)}
                                    style={{
                                        padding: 16,
                                        borderBottomWidth: 1,
                                        borderBottomColor: "#ccc"
                                    }}
                                >
                                    <Text style={{ fontSize: 16 }}>
                                        {item.givenName} {item.familyName}
                                    </Text>
                                    <Text style={{ color: "gray" }}>
                                        {item.phoneNumbers[0].number}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                    <Button title="Sulje" onPress={() => setModalVisible(false)} />
                </View>
            </Modal>
            <Button title="Valitse yhteyshenkilö osoitekirjasta " onPress={requestPermission} />

            {subscribtion &&
                <>
                    <Text style={styles.label}>
                        {monitoring ? 'Automaattiseuranta päällä' : 'Automaattiseuranta pois päältä'}
                    </Text>

                    <Switch
                        trackColor={{ false: '#ccc', true: '#81b0ff' }}
                        thumbColor="#fff"
                        onValueChange={toggleActivateMonitoring}
                        value={monitoring}
                    />
                </>
            }
            {subscribtion ?
                <>
                    <Button title="Peru tilaus" onPress={cancelSubscribeConfirm} />
                </> :
                <>
                    <Button title="Osta tilaus" onPress={confirmSubscribeConfirm} />
                </>
            }
            <Text style={styles.label}>Hälytysviestin muuttaminen</Text>
            <Switch
                trackColor={{ false: '#ccc', true: '#81b0ff' }}
                thumbColor="#fff"
                onValueChange={toggleManualMSG}
                value={manualMSG}
            />
            {manualMSG ? (
                <TextInput
                    onChangeText={setICE_MSG}
                    multiline={true}
                    placeholder={`AUTOMAATTINEN HÄTÄVIESTI SOLO-SOVELLUKSESTA! 
                    \nKäyttäjän ${ownName} puhelimesta ei ole havaittu elonmerkkeja.
                    \nYritä tavoittaa hänet numerosta ${ownNumber}. 
                    \nHälytä tarvittaessa apua!`}
                    style={styles.input}
                />
            ) : (
                <>
                    <Text></Text>
                    <Text>
                        AUTOMAATTINEN HÄTÄVIESTI SOLO-SOVELLUKSESTA!{"\n"}
                        Käyttäjän {ownName} puhelimesta ei ole havaittu elonmerkkejä.{"\n"}
                        Yritä tavoittaa hänet numerosta {ownNumber}.{"\n"}
                        Hälytä tarvittaessa apua!
                    </Text>
                </>
            )
            }
            <Button title="Tallenna asetukset" onPress={tallennaAsetukset} />

            <Button title="Palaa" onPress={closeSettings} />
            <Toast topOffset={60} />
        </View>
    )
}

const styles = StyleSheet.create({
    input: {
        height: 150,
        margin: 12,
        borderWidth: 1,
        padding: 10,
        width: '90%',
        borderColor: '#ccc',
        borderRadius: 5,
        textAlignVertical: 'top'
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 10,
        marginLeft: 12
    }
});

export default UserSettings