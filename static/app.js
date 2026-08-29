// ===============================
// SafeRoute AI
// GPS + Shake Detection + Alarm
// ===============================


// ===============================
// CONFIGURATION
// ===============================

// GPS movement threshold
// Keep 0 for highly sensitive testing
const MIN_MOVEMENT_METERS = 0;

// Laptop shake sensitivity
// Lower value = more sensitive
const SHAKE_THRESHOLD = 0.30;

// Prevent repeated shake alerts
const SHAKE_COOLDOWN = 1500;


// ===============================
// TRACKING STATE
// ===============================

let watchId = null;
let trackingActive = false;

let referencePosition = null;
let previousPosition = null;


// ===============================
// SHAKE DETECTION STATE
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
// DOM ELEMENTS
// ===============================

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

const trackingStatus =
    document.getElementById("trackingStatus");

const latitudeElement =
    document.getElementById("latitude");

const longitudeElement =
    document.getElementById("longitude");

const accuracyElement =
    document.getElementById("accuracy");

const speedElement =
    document.getElementById("speed");

const altitudeElement =
    document.getElementById("altitude");

const timestampElement =
    document.getElementById("timestamp");

const alertBox =
    document.getElementById("alertBox");

const movementMessage =
    document.getElementById("movementMessage");

const safeBtn =
    document.getElementById("safeBtn");

const emergencyBtn =
    document.getElementById("emergencyBtn");


// ===============================
// START TRACKING
// ===============================

startBtn.addEventListener("click", startTracking);


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

    alertBox.classList.add("hidden");

    stopAlarm();


    trackingStatus.textContent =
        "Requesting GPS...";


    // Start GPS
    watchId =
        navigator.geolocation.watchPosition(
            handlePosition,
            handleGeolocationError,
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        );


    // Start Device Motion
    await startShakeDetection();


    startBtn.disabled = true;
    stopBtn.disabled = false;


    console.log("GPS tracking started.");
    console.log("Shake detection started.");
}


// ===============================
// GPS POSITION
// ===============================

function handlePosition(position) {

    const coords = position.coords;


    const currentPosition = {

        latitude: coords.latitude,

        longitude: coords.longitude,

        accuracy: coords.accuracy,

        speed: coords.speed,

        altitude: coords.altitude,

        timestamp: position.timestamp
    };


    // ===============================
    // FIRST GPS POSITION
    // ===============================

    if (referencePosition === null) {

        referencePosition = currentPosition;

        previousPosition = currentPosition;


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
    // HAVERSINE DISTANCE
    // ===============================

    const distance =
        calculateDistance(
            previousPosition.latitude,
            previousPosition.longitude,
            currentPosition.latitude,
            currentPosition.longitude
        );


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
    // MOVEMENT DETECTION
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
            "GPS Movement"
        );
    }


    // ===============================
    // UPDATE PREVIOUS POSITION
    // ===============================

    previousPosition =
        currentPosition;


    updateGPSDisplay(
        currentPosition
    );


    trackingStatus.textContent =
        "Tracking Active";
}


// ===============================
// HAVERSINE FORMULA
// ===============================

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const EARTH_RADIUS = 6371000;


    const latitudeDifference =
        toRadians(lat2 - lat1);


    const longitudeDifference =
        toRadians(lon2 - lon1);


    const firstLatitude =
        toRadians(lat1);


    const secondLatitude =
        toRadians(lat2);


    const a =

        Math.sin(
            latitudeDifference / 2
        ) *
        Math.sin(
            latitudeDifference / 2
        )

        +

        Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *

        Math.sin(
            longitudeDifference / 2
        ) *
        Math.sin(
            longitudeDifference / 2
        );


    const c =

        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return EARTH_RADIUS * c;
}


// ===============================
// DEGREES TO RADIANS
// ===============================

function toRadians(degrees) {

    return degrees *
        (Math.PI / 180);
}


// ===============================
// DEVICE MOTION / SHAKE DETECTION
// ===============================

async function startShakeDetection() {

    // Check browser support

    if (
        !("DeviceMotionEvent" in window)
    ) {

        console.log(
            "DeviceMotion is not supported."
        );

        return;
    }


    // Some browsers require permission

    if (
        typeof DeviceMotionEvent.requestPermission ===
        "function"
    ) {

        try {

            const permission =
                await DeviceMotionEvent.requestPermission();


            if (permission !== "granted") {

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


    if (motionTrackingActive) {
        return;
    }


    window.addEventListener(
        "devicemotion",
        handleDeviceMotion
    );


    motionTrackingActive = true;


    console.log(
        "DeviceMotion listener active."
    );
}


// ===============================
// HANDLE DEVICE MOTION
// ===============================

function handleDeviceMotion(event) {

    if (!trackingActive) {
        return;
    }


    const acceleration =
        event.accelerationIncludingGravity;


    if (!acceleration) {

        console.log(
            "No acceleration data available."
        );

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


    // First motion reading

    if (lastAcceleration === null) {

        lastAcceleration =
            currentAcceleration;

        return;
    }


    // ===============================
    // CHANGE IN ACCELERATION
    // ===============================

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


    // ===============================
    // SHAKE THRESHOLD
    // ===============================

    const currentTime =
        Date.now();


    if (
        movementAmount >=
        SHAKE_THRESHOLD
        &&
        currentTime - lastShakeTime >=
        SHAKE_COOLDOWN
    ) {

        lastShakeTime =
            currentTime;


        console.log(
            "LAPTOP SHAKE DETECTED!"
        );


        handleShakeMovement(
            currentAcceleration,
            movementAmount
        );
    }


    lastAcceleration =
        currentAcceleration;
}


// ===============================
// SHAKE MOVEMENT HANDLER
// ===============================

function handleShakeMovement(
    acceleration,
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
        "Laptop Shake"
    );
}


// ===============================
// COMMON MOVEMENT HANDLER
// ===============================

function handleMovement(
    position,
    distance,
    source
) {

    alertBox.classList.remove(
        "hidden"
    );


    movementMessage.textContent =
        `${source} detected. Movement: ${distance.toFixed(3)}`;


    console.log(
        "SAFETY MOVEMENT EVENT"
    );


    console.log({

        source: source,

        latitude:
            position.latitude,

        longitude:
            position.longitude,

        accuracy:
            position.accuracy,

        speed:
            position.speed,

        altitude:
            position.altitude,

        timestamp:
            position.timestamp,

        movement:
            distance
    });


    // Start browser alarm

    startAlarm();
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
// PLAY ALARM SOUND
// ===============================

function playAlarmSound() {

    if (!audioContext) {
        return;
    }


    const oscillator =
        audioContext.createOscillator();


    const gain =
        audioContext.createGain();


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
        audioContext.currentTime + 0.4
    );
}


// ===============================
// STOP ALARM
// ===============================

function stopAlarm() {

    if (alarmInterval !== null) {

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
    function () {

        console.log(
            "Emergency button clicked."
        );

        // Twilio will be connected
        // in the next step.
    }
);


// ===============================
// UPDATE GPS DISPLAY
// ===============================

function updateGPSDisplay(
    position
) {

    latitudeElement.textContent =
        position.latitude.toFixed(6);


    longitudeElement.textContent =
        position.longitude.toFixed(6);


    accuracyElement.textContent =

        position.accuracy !== null
            ? position.accuracy.toFixed(2)
            : "Unavailable";


    speedElement.textContent =

        position.speed !== null
            ? position.speed.toFixed(2)
            : "Unavailable";


    altitudeElement.textContent =

        position.altitude !== null
            ? position.altitude.toFixed(2)
            : "Unavailable";


    timestampElement.textContent =
        new Date(
            position.timestamp
        ).toLocaleString();
}


// ===============================
// STOP TRACKING
// ===============================

stopBtn.addEventListener(
    "click",
    stopTracking
);


function stopTracking() {

    if (watchId !== null) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;
    }


    trackingActive = false;


    referencePosition = null;
    previousPosition = null;


    lastAcceleration = null;
    lastShakeTime = 0;


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
                "GPS Position Unavailable";

            break;


        case error.TIMEOUT:

            trackingStatus.textContent =
                "GPS Request Timeout";

            break;


        default:

            trackingStatus.textContent =
                "GPS Error";
    }
}