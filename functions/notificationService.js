
const createSilentPushNotification = (pushToken) => {
    return {
        token: pushToken,
        data: { task: "background-fetch-task" },
        apns: {
            headers: {
                "apns-priority": "5",
                "apns-push-type": "background"
            },
            payload: {
                aps: { contentAvailable: true }
            }
        }
    };
};

const sendSilentPushNotifications = async (admin, messages) => {
    if (messages.length === 0) return;

    try {
        const response = await admin.messaging().sendEach(messages);
        console.log(`Viestierä lähetetty. Onnistui: ${response.successCount}, Epäonnistui: ${response.failureCount}`);

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
};

module.exports = {
    createSilentPushNotification,
    sendSilentPushNotifications
};