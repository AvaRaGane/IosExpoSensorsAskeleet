const checkBatterySOL = (currentState, previousState) => {
    // Jos jompikumpi on 0 (UNKNOWN) palautetaan false
    // Jos molemmat ovat 2 (CHARGING) tai 3 (FULL) palautetaan false
    // Jos toinen on 2 (CHARGING) tai 3 (FULL) ja toinen 1 (UNPLUGGED) palautetaan true

    if (currentState === 0 || previousState === 0) {
        return false;
    }

    const isChargingOrFull = (state) => state === 2 || state === 3;

    if (isChargingOrFull(previousState) && isChargingOrFull(currentState)) {
        return false;
    }

    return previousState !== currentState;
}

const checkStepsSOL = (currentSteps, previousSteps) => {
    // jos currentSteps = 0 tai sitä ei ole, palautetaan false
    if (!currentSteps || currentSteps === 0) {
        return false;
    }
    // palautetaan true, jos currentSteps on suurempi kuin previousSteps, muuten false
    return currentSteps > previousSteps;
};

const addSOLUpdateToBatch = ({admin, batch, db, userId, batteryState, steps}) => {
    const userRef = db.collection('ios_users').doc(userId);

    batch.update(userRef, {
        batteryPreviousState: batteryState ?? 0,
        previousSteps: steps ?? 0,
        last_SOL: admin.firestore.FieldValue.serverTimestamp()
    })
}

module.exports = {
    checkBatterySOL,
    checkStepsSOL,
    addSOLUpdateToBatch
};