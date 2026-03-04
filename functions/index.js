const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

const { checkBatterySOL, checkStepsSOL, addSOLUpdateToBatch } = require("./signalOfLifeService");
const { createSilentPushNotification, sendSilentPushNotifications } = require("./notificationService")

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

db.settings({ ignoreUndefinedProperties: true });

exports.tarkistaElonmerkit = onSchedule("every 30 minutes", async (event) => {
    const now = new Date();
    const usersRef = db.collection("ios_users");
    const snapshot = await usersRef.get();

    const TARKISTUS_RAJA = 0.583 * 60 * 60 * 1000; // 35min
    const VAROITUS_RAJA = 23 * 60 * 60 * 1000; // 23h
    const HÄLYTYS_RAJA = 24 * 60 * 60 * 1000; // 24h

    // tyhjä taulukko viestejä varten
    const messages = [];
    const batch = db.batch();
    let somethingToSave = false;


    for (const doc of snapshot.docs) {
        const userData = doc.data();
        const userId = doc.id;

        if (!userData.last_SOL || !userData.pushToken || userData.emergencyMessageSent) continue;

        const lastSeen = userData.last_SOL.toDate();
        const timeDiff = now - lastSeen;

        const batterySOL = checkBatterySOL(userData.batteryCurrentState, userData.batteryPreviousState);
        const stepsSOL = checkStepsSOL(userData.currentSteps, userData.previousSteps);

        const updateParams = {
            admin, 
            batch,
            db,
            userId,
            batteryState: userData.batteryCurrentState,
            steps: userData.currentSteps
        }

        if (batterySOL || stepsSOL) {
            addSOLUpdateToBatch(updateParams);
            somethingToSave = true;
            continue;
        }

        /*if (timeDiff > HÄLYTYS_RAJA) {
            console.log(`HÄLYTYS: Käyttäjä ${userId} ei vastannut 24h!`);
            //tekstiviestit, push notifikaatio ja tietokantaan merkintä viestistä (emergencyMessageSent)
            continue;
        }*/

        /*if (timeDiff > VAROITUS_RAJA) {
            console.log(`HÄLYTYS: Käyttäjä ${userId} ei vastannut 23h!`);
            // push notifikaatio varoituksena, että on tunti aikaa reagoida, jonka jälkeen lähetetään hätäyhteytiedolle tekstiviesti.
            continue;
        }*/

        if (timeDiff > TARKISTUS_RAJA) {
            console.log(`HILJAINEN HERÄTYS: Käyttäjä ${userId}`);
            messages.push(createSilentPushNotification(userData.pushToken));
        }

    }

    if (somethingToSave) {
        await batch.commit();
        console.log("Kaikki elonmerkit päivitetty kantaan kerralla.");
    }

    await sendSilentPushNotifications(admin, messages);
});