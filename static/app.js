// ===============================
// SafeRoute AI
// GPS + Device Shake + Alarm
// Flask + Twilio Emergency
// ===============================


// ===============================
// CONFIGURATION
// ===============================

const MIN_MOVEMENT_METERS = 0;

const SHAKE_THRESHOLD = 0.30;

const SHAKE_COOLDOWN = 1500;


// ===============================
// TRACKING STATE
// ===============================

let watchId = null;

let trackingActive = false;

let referencePosition = null;

let previousPosition = null;

let previousSpeed = null;


// ===============================
// DEVICE MOTION STATE
// ===============================

let motionTrackingActive = false;

let lastAcceleration = null;

let lastShakeTime = 0;


// ===============================
// ALARM STATE
// ===============================

let audioContext = null;

let alarmInterval = null;

let alarmActive = false;


// ===============================
// LAST MOVEMENT EVENT
// ===============================

let lastMovementEvent = null;


// ===============================
// DOM ELEMENTS
// ===============================

const startBtn =
    document.getElementById(
        "startBtn"
    );

const stopBtn =
    document.getElementById(
        "stopBtn"
    );

const trackingStatus =
    document.getElementById(
        "trackingStatus"
    );

const latitudeElement =
    document.getElementById(
        "latitude"
    );

const longitudeElement =
    document.getElementById(
        "longitude"
    );

const accuracyElement =
    document.getElementById(
        "accuracy"
    );

const speedElement =
    document.getElementById(
        "speed"
    );

const altitudeElement =
    document.getElementById(
        "altitude"
    );

const timestampElement =
    document.getElementById(
        "timestamp"
    );

const alertBox =
    document.getElementById(
        "alertBox"
    );

const movementMessage =
    document.getElementById(
        "movementMessage"
    );

const safeBtn =
    document.getElementById(
        "safeBtn"
    );

const emergencyBtn =
    document.getElementById(
        "emergencyBtn"
    );


// ===============================
// START TRACKING
// ===============================

startBtn.addEventListener(
    "click",
    startTracking
);


async function startTracking() {

    if (!navigator.geolocation) {

        alert(
            "Geolocation is not supported by this browser."
        );

        return;
    }


    if (trackingActive) {

        return;
    }


    trackingActive = true;


    referencePosition = null;

    previousPosition = null;

    previousSpeed = null;

    lastAcceleration = null;

    lastShakeTime = 0;

    lastMovementEvent = null;


    alertBox.classList.add(
        "hidden"
    );


    stopAlarm();


    trackingStatus.textContent =
        "Requesting GPS...";


    watchId =
        navigator.geolocation.watchPosition(

            handlePosition,

            handleGeolocationError,

            {

                enableHighAccuracy:
                    true,

                maximumAge:
                    10000,

                timeout:
                    20000
            }
        );


    await startShakeDetection();


    startBtn.disabled = true;

    stopBtn.disabled = false;


    console.log(
        "GPS tracking started."
    );

    console.log(
        "Shake detection started."
    );
}


// ===============================
// GPS POSITION
// ===============================

function handlePosition(
    position
) {

    const coords =
        position.coords;


    const currentPosition = {

        latitude:
            coords.latitude,

        longitude:
            coords.longitude,

        accuracy:
            coords.accuracy,

        speed:
            coords.speed,

        altitude:
            coords.altitude,

        timestamp:
            position.timestamp
    };


    // ===============================
    // FIRST POSITION
    // ===============================

    if (
        referencePosition === null
    ) {

        referencePosition =
            currentPosition;

        previousPosition =
            currentPosition;


        if (
            currentPosition.speed !== null
        ) {

            previousSpeed =
                currentPosition.speed;
        }


        updateGPSDisplay(
            currentPosition
        );


        trackingStatus.textContent =
            "Tracking Active";


        console.log(
            "Reference position saved:"
        );

        console.log(
            referencePosition
        );


        return;
    }


    // ===============================
    // DISTANCE
    // ===============================

    const distance =
        calculateDistance(

            previousPosition.latitude,

            previousPosition.longitude,

            currentPosition.latitude,

            currentPosition.longitude
        );


    // ===============================
    // SPEED CHANGE
    // ===============================

    let speedChange = 0;


    if (

        currentPosition.speed !== null

        &&

        previousSpeed !== null

    ) {

        speedChange =
            currentPosition.speed -
            previousSpeed;
    }


    console.log(
        "Previous Position:",
        previousPosition
    );


    console.log(
        "Current Position:",
        currentPosition
    );


    console.log(
        "GPS Distance:",
        distance.toFixed(4),
        "meters"
    );


    // ===============================
    // GPS MOVEMENT
    // ===============================

    if (
        distance >
        MIN_MOVEMENT_METERS
    ) {

        console.log(
            "GPS MOVEMENT DETECTED!"
        );


        handleMovement(

            currentPosition,

            distance,

            "GPS Movement",

            speedChange,

            0,

            null
        );
    }


    previousPosition =
        currentPosition;


    if (
        currentPosition.speed !== null
    ) {

        previousSpeed =
            currentPosition.speed;
    }


    updateGPSDisplay(
        currentPosition
    );


    trackingStatus.textContent =
        "Tracking Active";
}


// ===============================
// HAVERSINE
// ===============================

function calculateDistance(

    lat1,

    lon1,

    lat2,

    lon2

) {

    const EARTH_RADIUS =
        6371000;


    const latitudeDifference =
        toRadians(
            lat2 - lat1
        );


    const longitudeDifference =
        toRadians(
            lon2 - lon1
        );


    const firstLatitude =
        toRadians(lat1);


    const secondLatitude =
        toRadians(lat2);


    const a =

        Math.sin(
            latitudeDifference / 2
        ) ** 2

        +

        Math.cos(firstLatitude) *

        Math.cos(secondLatitude) *

        Math.sin(
            longitudeDifference / 2
        ) ** 2;


    const c =

        2 *

        Math.atan2(

            Math.sqrt(a),

            Math.sqrt(1 - a)
        );


    return (
        EARTH_RADIUS * c
    );
}


// ===============================
// RADIANS
// ===============================

function toRadians(
    degrees
) {

    return degrees *
        (
            Math.PI / 180
        );
}


// ===============================
// DEVICE MOTION
// ===============================

async function startShakeDetection() {

    if (
        !(
            "DeviceMotionEvent"
            in window
        )
    ) {

        console.log(
            "DeviceMotion is not supported."
        );

        return;
    }


    if (

        typeof
        DeviceMotionEvent
            .requestPermission
        ===
        "function"

    ) {

        try {

            const permission =
                await
                DeviceMotionEvent
                    .requestPermission();


            if (
                permission !==
                "granted"
            ) {

                console.log(
                    "DeviceMotion permission denied."
                );

                return;
            }

        } catch (error) {

            console.error(
                "DeviceMotion permission error:",
                error
            );

            return;
        }
    }


    if (
        motionTrackingActive
    ) {

        return;
    }


    window.addEventListener(

        "devicemotion",

        handleDeviceMotion

    );


    motionTrackingActive =
        true;


    console.log(
        "DeviceMotion listener active."
    );
}


// ===============================
// DEVICE MOTION HANDLER
// ===============================

function handleDeviceMotion(
    event
) {

    if (!trackingActive) {

        return;
    }


    const acceleration =
        event.accelerationIncludingGravity;


    if (!acceleration) {

        return;
    }


    const x =
        acceleration.x ?? 0;

    const y =
        acceleration.y ?? 0;

    const z =
        acceleration.z ?? 0;


    const currentAcceleration = {

        x: x,

        y: y,

        z: z
    };


    if (
        lastAcceleration === null
    ) {

        lastAcceleration =
            currentAcceleration;

        return;
    }


    const deltaX =
        Math.abs(

            currentAcceleration.x -
            lastAcceleration.x

        );


    const deltaY =
        Math.abs(

            currentAcceleration.y -
            lastAcceleration.y

        );


    const deltaZ =
        Math.abs(

            currentAcceleration.z -
            lastAcceleration.z

        );


    const movementAmount =
        Math.sqrt(

            deltaX * deltaX +

            deltaY * deltaY +

            deltaZ * deltaZ
        );


    console.log(

        "Shake movement:",

        movementAmount.toFixed(3)

    );


    const currentTime =
        Date.now();


    if (

        movementAmount >=
        SHAKE_THRESHOLD

        &&

        currentTime -
        lastShakeTime >=
        SHAKE_COOLDOWN

    ) {

        lastShakeTime =
            currentTime;


        console.log(
            "DEVICE SHAKE DETECTED!"
        );


        handleShakeMovement(
            movementAmount
        );
    }


    lastAcceleration =
        currentAcceleration;
}


// ===============================
// SHAKE MOVEMENT
// ===============================

function handleShakeMovement(
    movementAmount
) {

    const shakePosition = {

        latitude:

            previousPosition
                ? previousPosition.latitude
                : null,

        longitude:

            previousPosition
                ? previousPosition.longitude
                : null,

        accuracy:

            previousPosition
                ? previousPosition.accuracy
                : null,

        speed:

            previousPosition
                ? previousPosition.speed
                : null,

        altitude:

            previousPosition
                ? previousPosition.altitude
                : null,

        timestamp:
            Date.now()
    };


    handleMovement(

        shakePosition,

        movementAmount,

        "Device Shake",

        0,

        movementAmount,

        null
    );
}


// ===============================
// COMMON MOVEMENT HANDLER
// ===============================

function handleMovement(

    position,

    distance,

    source,

    speedChange = 0,

    acceleration = 0,

    direction = null

) {

    const movementEvent = {

        latitude:
            position.latitude,

        longitude:
            position.longitude,

        accuracy:
            position.accuracy,

        altitude:
            position.altitude,

        timestamp:
            position.timestamp,

        distance:
            distance,

        speed:
            position.speed,

        previous_speed:
            previousSpeed,

        speed_change:
            speedChange,

        acceleration:
            acceleration,

        direction:
            direction,

        source:
            source
    };


    lastMovementEvent =
        movementEvent;


    // ===============================
    // VISUAL ALERT
    // ===============================

    alertBox.classList.remove(
        "hidden"
    );


    movementMessage.textContent =

        `${source} detected. Movement: ` +

        `${distance.toFixed(3)}`;


    // ===============================
    // LOG
    // ===============================

    console.log(
        "SAFETY MOVEMENT EVENT"
    );

    console.log(
        movementEvent
    );


    // ===============================
    // BROWSER ALARM
    // ===============================

    startAlarm();


    // ===============================
    // FLASK
    // ===============================

    sendMovementToBackend(
        movementEvent
    );
}


// ===============================
// SEND MOVEMENT TO FLASK
// ===============================

async function sendMovementToBackend(
    movementData
) {

    try {

        console.log(
            "Sending movement to Flask:",
            movementData
        );


        const response =
            await fetch(

                "/movement",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            movementData
                        )
                }
            );


        const result =
            await response.json();


        console.log(
            "Flask movement response:",
            result
        );


        if (
            !result.success
        ) {

            console.error(
                "Movement API failed:",
                result.message
            );

            return;
        }


        console.log(
            "Risk Level:",
            result.risk_level
        );


        console.log(
            "Risk Score:",
            result.risk_score
        );


        console.log(
            "Recommended Action:",
            result.action
        );


    } catch (error) {

        console.error(
            "Unable to send movement to Flask:",
            error
        );
    }
}


// ===============================
// BROWSER ALARM
// ===============================

function startAlarm() {

    if (alarmActive) {

        return;
    }


    alarmActive = true;


    try {

        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();


        if (
            audioContext.state ===
            "suspended"
        ) {

            audioContext.resume();
        }


        playAlarmSound();


        alarmInterval =
            setInterval(

                playAlarmSound,

                1000

            );


        console.log(
            "Browser safety alarm started."
        );


    } catch (error) {

        console.error(
            "Unable to start browser alarm:",
            error
        );
    }
}


// ===============================
// PLAY ALARM
// ===============================

function playAlarmSound() {

    if (!audioContext) {

        return;
    }


    const oscillator =
        audioContext
            .createOscillator();


    const gain =
        audioContext
            .createGain();


    oscillator.type =
        "sine";


    oscillator.frequency.setValueAtTime(

        880,

        audioContext.currentTime

    );


    gain.gain.setValueAtTime(

        0.3,

        audioContext.currentTime

    );


    gain.gain.exponentialRampToValueAtTime(

        0.01,

        audioContext.currentTime + 0.4

    );


    oscillator.connect(gain);

    gain.connect(
        audioContext.destination
    );


    oscillator.start();


    oscillator.stop(

        audioContext.currentTime +
        0.4

    );
}


// ===============================
// STOP ALARM
// ===============================

function stopAlarm() {

    if (
        alarmInterval !== null
    ) {

        clearInterval(
            alarmInterval
        );

        alarmInterval = null;
    }


    if (audioContext) {

        audioContext.close();

        audioContext = null;
    }


    alarmActive = false;


    console.log(
        "Browser safety alarm stopped."
    );
}


// ===============================
// CONFIRM SAFE
// ===============================

safeBtn.addEventListener(

    "click",

    function () {

        stopAlarm();


        alertBox.classList.add(
            "hidden"
        );


        console.log(
            "User confirmed safe."
        );
    }

);


// ===============================
// REPORT EMERGENCY
// ===============================

emergencyBtn.addEventListener(

    "click",

    reportEmergency

);


async function reportEmergency() {

    const confirmed =
        confirm(

            "Are you sure you want to report an emergency?\n\n" +

            "An SMS will be sent to your emergency contact."

        );


    if (!confirmed) {

        return;
    }


    // Keep alarm active while
    // emergency request is sent.


    console.log(
        "Reporting emergency..."
    );


    // Use latest movement data

    const emergencyData =
        lastMovementEvent || {

            latitude:
                previousPosition
                    ? previousPosition.latitude
                    : null,

            longitude:
                previousPosition
                    ? previousPosition.longitude
                    : null,

            accuracy:
                previousPosition
                    ? previousPosition.accuracy
                    : null,

            distance:
                0,

            source:
                "Emergency Button"
        };


    try {

        const response =
            await fetch(

                "/api/emergency",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            emergencyData
                        )
                }
            );


        const result =
            await response.json();


        console.log(
            "Emergency response:",
            result
        );


        if (
            result.success
        ) {

            alert(
                "Emergency alert sent successfully."
            );


            console.log(
                "Emergency SMS sent."
            );


        } else {

            alert(

                "Emergency alert could not be sent.\n\n" +

                result.message

            );
        }


    } catch (error) {

        console.error(
            "Emergency request failed:",
            error
        );


        alert(
            "Unable to contact the emergency server."
        );
    }
}


// ===============================
// GPS DISPLAY
// ===============================

function updateGPSDisplay(
    position
) {

    if (
        position.latitude !== null &&
        position.latitude !== undefined
    ) {

        latitudeElement.textContent =
            Number(
                position.latitude
            ).toFixed(6);

    } else {

        latitudeElement.textContent =
            "--";
    }


    if (
        position.longitude !== null &&
        position.longitude !== undefined
    ) {

        longitudeElement.textContent =
            Number(
                position.longitude
            ).toFixed(6);

    } else {

        longitudeElement.textContent =
            "--";
    }


    accuracyElement.textContent =

        position.accuracy !== null &&
        position.accuracy !== undefined

            ? Number(
                position.accuracy
              ).toFixed(2)

            : "Unavailable";


    speedElement.textContent =

        position.speed !== null &&
        position.speed !== undefined

            ? Number(
                position.speed
              ).toFixed(2)

            : "Unavailable";


    altitudeElement.textContent =

        position.altitude !== null &&
        position.altitude !== undefined

            ? Number(
                position.altitude
              ).toFixed(2)

            : "Unavailable";


    timestampElement.textContent =

        position.timestamp

            ? new Date(
                position.timestamp
              ).toLocaleString()

            : "--";
}


// ===============================
// GPS ERROR HANDLING
// ===============================

function handleGeolocationError(
    error
) {

    console.error(
        "GPS Error:",
        error
    );


    switch (error.code) {

        case error.PERMISSION_DENIED:

            trackingStatus.textContent =
                "Location Permission Denied";

            break;


        case error.POSITION_UNAVAILABLE:

            trackingStatus.textContent =
                "GPS Temporarily Unavailable";

            break;


        case error.TIMEOUT:

            trackingStatus.textContent =
                "Tracking Active - Waiting for GPS";

            break;


        default:

            trackingStatus.textContent =
                "GPS Error - Tracking Active";
    }
}


// ===============================
// STOP TRACKING
// ===============================

stopBtn.addEventListener(

    "click",

    stopTracking

);


function stopTracking() {

    if (
        watchId !== null
    ) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;
    }


    trackingActive = false;


    referencePosition = null;

    previousPosition = null;

    previousSpeed = null;

    lastAcceleration = null;

    lastShakeTime = 0;

    lastMovementEvent = null;


    stopAlarm();


    alertBox.classList.add(
        "hidden"
    );


    trackingStatus.textContent =
        "Not Tracking";


    startBtn.disabled = false;

    stopBtn.disabled = true;


    console.log(
        "GPS tracking stopped."
    );
}