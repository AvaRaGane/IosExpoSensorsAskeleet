import { View, Text, Button } from 'react-native'
import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Picker } from '@react-native-picker/picker';

const UserSettings = ({ setShowUserSettings }) => {
    const [aamunAloitus, setAamunAloitus] = useState(8)

    useEffect(() => {
        const loadAamunAloitus = async () => {
            const value = await AsyncStorage.getItem('IOS_AAMUN_ALOITUS_H');
            const hour = parseInt(value, 10);
            setAamunAloitus(hour || 8);
        };

        loadAamunAloitus();
    }, []);

    const heratys = async () => {
        try {
            await AsyncStorage.setItem('IOS_AAMUN_ALOITUS_H', String(aamunAloitus))
            console.log("Asetettu aamunAloitusH asyncStorageen klo", aamunAloitus);

        } catch (error) {
            console.log()
        }
    }

    return (
        <View style={{ marginTop: 80 }}>
            <Text>Mihin aikaan aamulla yleensä heräät?</Text>
            <Picker
                selectedValue={aamunAloitus}
                onValueChange={(value) => setAamunAloitus(value)}
            >
                {[6, 7, 8, 9, 10, 11, 12].map((h) => (
                    <Picker.Item
                        key={h}
                        label={`${h}:00`}
                        value={h}
                    />
                ))}
            </Picker>
            <Button title="Aseta " onPress={heratys} />
            <Button title="Palaa" onPress={() => setShowUserSettings(false)} />
        </View>
    )
}

export default UserSettings