const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

exports.tarkistaElonmerkit = onSchedule("every 30 minutes", async (event) => {
    const now = new Date();
    const usersRef = db.collection("ios_users");
    const snapshot = await usersRef.get();

    const VAROITUS_RAJA = 0.5 * 60 * 60 * 1000; // 30 min
    const HÄLYTYS_RAJA = 24 * 60 * 60 * 1000; // 24h

    // Firebasessa viestit kerätään taulukkoon
    const messages = [];

    for (const doc of snapshot.docs) {
        const userData = doc.data();
        const userId = doc.id;

        if (!userData.last_SOL || !userData.pushToken) continue;

        const lastSeen = userData.last_SOL.toDate();
        const timeDiff = now - lastSeen;

        // Varmistetaan, ettei token ole enää Expon vanha token
        if (userData.pushToken.includes("ExponentPushToken")) {
            console.log(`Ohitettaan vanha Expo-token käyttäjällä ${userId}`);
            continue;
        }

        if (timeDiff > HÄLYTYS_RAJA) {
            console.log(`HÄLYTYS: Käyttäjä ${userId} ei vastannut 24h!`);
            continue;
        }

        if (timeDiff > VAROITUS_RAJA) {
            console.log(`HILJAINEN HERÄTYS: Käyttäjä ${userId}`);
            
            messages.push({
                token: userData.pushToken,
                data: {
                    task: "background-fetch-task"
                },
                apns: {
                    headers: {
                        "apns-priority": "5",
                        "apns-push-type": "background" // TÄMÄ ON PAKOLLINEN iOS:lle!
                    },
                    payload: {
                        aps: {
                            contentAvailable: true // Firebase Admin käyttää tätä muotoa
                        }
                    }
                }
            });
        }
    }

    // Lähetetään viestit Firebasen kautta
    if (messages.length > 0) {
        try {
            const response = await admin.messaging().sendEach(messages);
            console.log(`Viestierä lähetetty. Onnistui: ${response.successCount}, Epäonnistui: ${response.failureCount}`);

            // LISÄTTY LOKITUS: Katsotaan MIKSI se epäonnistui
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.error(`Syy viestin ${idx} epäonnistumiseen:`, resp.error);
                    }
                });
            }
        } catch (error) {
            console.error("Virhe FCM-lähetyksessä:", error);
        }
    }
});