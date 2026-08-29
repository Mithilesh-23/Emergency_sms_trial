"use strict";

/*
============================================================
SafeRoute AI
GPS MOVEMENT + DEVICE SHAKE + EMERGENCY SMS
============================================================
*/


/* =========================================================
   CONFIGURATION
========================================================= */

const MIN_MOVEMENT_METERS = 0.0;

// For testing: small device shake can trigger detection.
const SHAKE_THRESHOLD = 12;

const SHAKE_COOLDOWN = 3000;


/* =========================================================
   USER ID
========================================================= */

let userId = localStorage.getItem("saferoute_user_id");

if (!userId) {
    userId =
        "browser_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substring(2, 8);

    localStorage.setItem(
        "saferoute_user_id",
        userId
    );
}


/* =========================================================
   STATE
========================================================= */

let tracking = false;

let watchId = null;

let previousPosition = null;
let currentPosition = null;

let currentSpeed = 0;
let previousSpeed = 0;

let currentBearing = null;

let totalDistance = 0;

let shakeLastTime = 0;

let audioContext = null;
let alarmInterval = null;

let movementRequestInProgress = false;


/* =========================================================
   DOM
========================================================= */

function getElement(id) {
    return document.getElementById(id);
}


/* =========================================================
   STATUS
========================================================= */

function setStatus(message) {

    const element =
        getElement("trackingStatus");

    if (element) {
        element.textContent = message;
    }

    console.log("[SafeRoute]", message);
}


/* =========================================================
   NUMBER
========================================================= */

function safeNumber(value, fallback = 0) {

    const number = Number(value);

    if (Number.isFinite(number)) {
        return number;
    }

    return fallback;
}


/* =========================================================
   DISTANCE
========================================================= */

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371000;

    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;

    const dLon =
        (lon2 - lon1) *
        Math.PI / 180;

    const lat1Rad =
        lat1 *
        Math.PI / 180;

    const lat2Rad =
        lat2 *
        Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(dLon / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}


/* =========================================================
   BEARING
========================================================= */

function calculateBearing(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const lat1Rad =
        lat1 *
        Math.PI / 180;

    const lat2Rad =
        lat2 *
        Math.PI / 180;

    const deltaLon =
        (lon2 - lon1) *
        Math.PI / 180;

    const y =
        Math.sin(deltaLon) *
        Math.cos(lat2Rad);

    const x =
        Math.cos(lat1Rad) *
        Math.sin(lat2Rad) -
        Math.sin(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.cos(deltaLon);

    const bearing =
        Math.atan2(y, x) *
        180 / Math.PI;

    return (bearing + 360) % 360;
}


/* =========================================================
   SERVER REQUEST
========================================================= */

async function postJSON(
    url,
    data
) {

    console.log("POST", url, data);

    const response =
        await fetch(
            url,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(data)
            }
        );

    let result = {};

    try {
        result = await response.json();
    }
    catch (error) {
        console.warn(
            "Response was not JSON:",
            error
        );
    }

    console.log(
        "Response:",
        response.status,
        result
    );

    if (!response.ok) {

        throw new Error(
            result.error ||
            result.message ||
            `Server returned ${response.status}`
        );
    }

    return result;
}


/* =========================================================
   AUDIO
========================================================= */

async function initializeAudio() {

    try {

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            return;
        }

        if (!audioContext) {
            audioContext =
                new AudioContextClass();
        }

        if (
            audioContext.state ===
            "suspended"
        ) {
            await audioContext.resume();
        }

    }
    catch (error) {

        console.warn(
            "Audio initialization failed:",
            error
        );
    }
}


/* =========================================================
   BELL
========================================================= */

function playBell() {

    if (!audioContext) {
        return;
    }

    try {

        const oscillator =
            audioContext.createOscillator();

        const gain =
            audioContext.createGain();

        const now =
            audioContext.currentTime;

        oscillator.type = "sine";

        oscillator.frequency.setValueAtTime(
            880,
            now
        );

        oscillator.frequency.exponentialRampToValueAtTime(
            500,
            now + 0.7
        );

        gain.gain.setValueAtTime(
            0.0001,
            now
        );

        gain.gain.exponentialRampToValueAtTime(
            0.5,
            now + 0.03
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + 0.7
        );

        oscillator.connect(gain);

        gain.connect(
            audioContext.destination
        );

        oscillator.start(now);

        oscillator.stop(
            now + 0.7
        );

    }
    catch (error) {

        console.error(
            "Bell error:",
            error
        );
    }
}


/* =========================================================
   START ALARM
========================================================= */

async function startAlarm() {

    await initializeAudio();

    stopAlarm();

    playBell();

    alarmInterval =
        setInterval(
            playBell,
            900
        );
}


/* =========================================================
   STOP ALARM
========================================================= */

function stopAlarm() {

    if (alarmInterval) {

        clearInterval(
            alarmInterval
        );

        alarmInterval = null;
    }
}


/* =========================================================
   ALERT BOX
========================================================= */

function showEmergencyAlert(
    message,
    response = {}
) {

    const alertBox =
        getElement("alertBox");

    const movementMessage =
        getElement("movementMessage");

    if (!alertBox) {

        console.error(
            "alertBox not found in HTML"
        );

        return;
    }

    if (movementMessage) {

        movementMessage.textContent =
            message ||
            "Movement detected. Please confirm your safety.";
    }

    /*
    --------------------------------------------------------
    Update heading based on risk
    --------------------------------------------------------
    */

    const heading =
        alertBox.querySelector("h2");

    if (heading) {

        const level =
            response.risk_level ||
            response.emergency_risk ||
            "HIGH";

        if (level === "HIGH") {

            heading.textContent =
                "🚨 Emergency Movement Detected";

        }
        else {

            heading.textContent =
                "⚠ Movement Detected";
        }
    }


    /*
    --------------------------------------------------------
    SHOW BOX
    --------------------------------------------------------
    */

    alertBox.classList.remove(
        "hidden"
    );

    alertBox.style.display = "block";

    alertBox.style.visibility = "visible";

    alertBox.style.opacity = "1";


    /*
    --------------------------------------------------------
    ALARM
    --------------------------------------------------------
    */

    startAlarm();

    console.log(
        "Emergency alert shown.",
        response
    );
}


/* =========================================================
   HIDE ALERT
========================================================= */

function hideEmergencyAlert() {

    const alertBox =
        getElement("alertBox");

    stopAlarm();

    if (alertBox) {

        alertBox.classList.add(
            "hidden"
        );

        alertBox.style.display =
            "none";
    }
}


/* =========================================================
   UPDATE GPS UI
========================================================= */

function updateGPSUI(position) {

    const coords =
        position.coords;

    const latitude =
        safeNumber(
            coords.latitude
        );

    const longitude =
        safeNumber(
            coords.longitude
        );

    const accuracy =
        safeNumber(
            coords.accuracy
        );

    const altitude =
        coords.altitude !== null
            ? safeNumber(
                coords.altitude
            )
            : null;


    const latitudeElement =
        getElement("latitude");

    const longitudeElement =
        getElement("longitude");

    const accuracyElement =
        getElement("accuracy");

    const speedElement =
        getElement("speed");

    const altitudeElement =
        getElement("altitude");

    const timestampElement =
        getElement("timestamp");


    if (latitudeElement) {

        latitudeElement.textContent =
            latitude.toFixed(6);
    }


    if (longitudeElement) {

        longitudeElement.textContent =
            longitude.toFixed(6);
    }


    if (accuracyElement) {

        accuracyElement.textContent =
            accuracy.toFixed(2);
    }


    if (speedElement) {

        speedElement.textContent =
            currentSpeed.toFixed(2);
    }


    if (altitudeElement) {

        altitudeElement.textContent =
            altitude !== null
                ? altitude.toFixed(2)
                : "--";
    }


    if (timestampElement) {

        timestampElement.textContent =
            new Date(
                position.timestamp
            ).toLocaleString();
    }
}


/* =========================================================
   SEND MOVEMENT
========================================================= */

async function sendMovement(
    position,
    movement
) {

    if (movementRequestInProgress) {
        return null;
    }

    movementRequestInProgress =
        true;

    try {

        const coords =
            position.coords;

        const payload = {

            user_id:
                userId,

            source:
                movement.source ||
                "GPS",

            gps_available:
                true,

            latitude:
                coords.latitude,

            longitude:
                coords.longitude,

            accuracy:
                coords.accuracy,

            altitude:
                coords.altitude,

            timestamp:
                position.timestamp,

            distance:
                safeNumber(
                    movement.distance
                ),

            speed:
                safeNumber(
                    movement.speed
                ),

            previous_speed:
                safeNumber(
                    movement.previousSpeed
                ),

            speed_change:
                safeNumber(
                    movement.speedChange
                ),

            acceleration:
                safeNumber(
                    movement.acceleration
                ),

            direction:
                movement.direction
        };


        const response =
            await postJSON(
                "/movement",
                payload
            );


        console.log(
            "Movement result:",
            response
        );


        /*
        ----------------------------------------------------
        HIGH RISK
        ----------------------------------------------------
        */

        if (
            response &&
            (
                response.risk_level ===
                    "HIGH"
                ||
                response.emergency_risk ===
                    "HIGH"
            )
        ) {

            showEmergencyAlert(

                response.message ||
                "🚨 High-risk movement detected. Please confirm your safety.",

                response
            );
        }


        /*
        ----------------------------------------------------
        MEDIUM RISK
        ----------------------------------------------------
        */

        else if (
            response &&
            response.risk_level ===
                "MEDIUM"
        ) {

            showEmergencyAlert(

                response.message ||
                "⚠ Unusual movement detected. Please confirm your safety.",

                response
            );
        }

        return response;

    }
    catch (error) {

        console.error(
            "Movement request failed:",
            error
        );

        setStatus(
            "⚠ Movement server error."
        );

        return null;

    }
    finally {

        movementRequestInProgress =
            false;
    }
}


/* =========================================================
   GPS POSITION
========================================================= */

async function processGPSPosition(
    position
) {

    if (!tracking) {
        return;
    }


    updateGPSUI(
        position
    );


    const coords =
        position.coords;


    const latitude =
        Number(
            coords.latitude
        );

    const longitude =
        Number(
            coords.longitude
        );


    currentPosition = {

        latitude:
            latitude,

        longitude:
            longitude,

        accuracy:
            safeNumber(
                coords.accuracy,
                999
            ),

        altitude:
            coords.altitude,

        timestamp:
            position.timestamp
    };


    /*
    --------------------------------------------------------
    FIRST GPS POSITION
    --------------------------------------------------------
    */

    if (!previousPosition) {

        previousPosition =
            currentPosition;

        currentSpeed =
            0;

        previousSpeed =
            0;

        totalDistance =
            0;


        setStatus(
            "🟢 GPS tracking active"
        );


        await sendMovement(

            position,

            {
                source:
                    "GPS",

                distance:
                    0,

                speed:
                    0,

                previousSpeed:
                    0,

                speedChange:
                    0,

                acceleration:
                    0,

                direction:
                    null
            }
        );

        return;
    }


    /*
    --------------------------------------------------------
    DISTANCE
    --------------------------------------------------------
    */

    const distance =
        calculateDistance(

            previousPosition.latitude,

            previousPosition.longitude,

            latitude,

            longitude
        );


    totalDistance +=
        distance;


    /*
    --------------------------------------------------------
    TIME
    --------------------------------------------------------
    */

    let deltaTime =
        (
            position.timestamp -
            previousPosition.timestamp
        ) / 1000;


    if (
        !Number.isFinite(
            deltaTime
        )
        ||
        deltaTime <= 0
    ) {

        deltaTime = 1;
    }


    /*
    --------------------------------------------------------
    SPEED
    --------------------------------------------------------
    */

    let speed =
        Number(
            coords.speed
        );


    if (
        !Number.isFinite(speed)
        ||
        speed < 0
    ) {

        speed =
            distance /
            deltaTime;
    }


    const speedKmh =
        speed * 3.6;


    previousSpeed =
        currentSpeed;

    currentSpeed =
        speedKmh;


    const speedChange =
        currentSpeed -
        previousSpeed;


    /*
    --------------------------------------------------------
    ACCELERATION
    --------------------------------------------------------
    */

    const acceleration =
        (
            speed -
            (
                previousSpeed /
                3.6
            )
        ) /
        deltaTime;


    /*
    --------------------------------------------------------
    DIRECTION
    --------------------------------------------------------
    */

    let direction =
        currentBearing;


    if (
        distance >=
        MIN_MOVEMENT_METERS
    ) {

        if (
            distance >= 0.5
        ) {

            direction =
                calculateBearing(

                    previousPosition.latitude,

                    previousPosition.longitude,

                    latitude,

                    longitude
                );

            currentBearing =
                direction;
        }
    }


    /*
    --------------------------------------------------------
    SEND MOVEMENT
    --------------------------------------------------------
    */

    if (
        distance >
        MIN_MOVEMENT_METERS
    ) {

        await sendMovement(

            position,

            {

                source:
                    "GPS",

                distance:
                    distance,

                speed:
                    currentSpeed,

                previousSpeed:
                    previousSpeed,

                speedChange:
                    speedChange,

                acceleration:
                    acceleration,

                direction:
                    direction
            }
        );
    }


    /*
    --------------------------------------------------------
    STORE POSITION
    --------------------------------------------------------
    */

    previousPosition =
        currentPosition;
}


/* =========================================================
   GPS ERROR
========================================================= */

function handleGPSError(
    error
) {

    console.error(
        "GPS error:",
        error
    );


    if (!tracking) {
        return;
    }


    if (error.code === 1) {

        setStatus(
            "📍 GPS permission denied"
        );

    }
    else if (error.code === 2) {

        setStatus(
            "📡 GPS unavailable"
        );

    }
    else if (error.code === 3) {

        setStatus(
            "⏱ GPS timeout - retrying"
        );

    }
    else {

        setStatus(
            "⚠ GPS error"
        );
    }
}


/* =========================================================
   START GPS
========================================================= */

function startGPS() {

    if (
        !navigator.geolocation
    ) {

        setStatus(
            "❌ Geolocation is not supported"
        );

        return;
    }


    watchId =
        navigator.geolocation.watchPosition(

            processGPSPosition,

            handleGPSError,

            {
                enableHighAccuracy:
                    true,

                maximumAge:
                    0,

                timeout:
                    15000
            }
        );


    console.log(
        "GPS watch started:",
        watchId
    );
}


/* =========================================================
   RESET SERVER
========================================================= */

async function resetServer() {

    try {

        const response =
            await postJSON(

                "/reset",

                {
                    user_id:
                        userId
                }
            );


        console.log(
            "Reset successful:",
            response
        );

    }
    catch (error) {

        console.warn(
            "Reset failed:",
            error
        );
    }
}


/* =========================================================
   START TRACKING
========================================================= */

async function startTracking() {

    if (tracking) {
        return;
    }


    console.log(
        "START TRACKING CLICKED"
    );


    /*
    --------------------------------------------------------
    RESET LOCAL STATE
    --------------------------------------------------------
    */

    tracking = true;

    previousPosition =
        null;

    currentPosition =
        null;

    currentSpeed =
        0;

    previousSpeed =
        0;

    currentBearing =
        null;

    totalDistance =
        0;


    hideEmergencyAlert();


    /*
    --------------------------------------------------------
    AUDIO
    --------------------------------------------------------
    */

    await initializeAudio();


    /*
    --------------------------------------------------------
    RESET BACKEND
    --------------------------------------------------------
    */

    await resetServer();


    /*
    --------------------------------------------------------
    GPS
    --------------------------------------------------------
    */

    startGPS();


    /*
    --------------------------------------------------------
    DEVICE SHAKE
    --------------------------------------------------------
    */

    await enableDeviceShake();


    /*
    --------------------------------------------------------
    BUTTONS
    --------------------------------------------------------
    */

    const startBtn =
        getElement("startBtn");

    const stopBtn =
        getElement("stopBtn");


    if (startBtn) {

        startBtn.disabled =
            true;
    }


    if (stopBtn) {

        stopBtn.disabled =
            false;
    }


    setStatus(
        "📍 Tracking started - waiting for GPS"
    );
}


/* =========================================================
   STOP TRACKING
========================================================= */

async function stopTracking() {

    console.log(
        "STOP TRACKING CLICKED"
    );


    tracking = false;


    /*
    --------------------------------------------------------
    STOP GPS
    --------------------------------------------------------
    */

    if (
        watchId !== null
    ) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;
    }


    /*
    --------------------------------------------------------
    STOP ALARM
    --------------------------------------------------------
    */

    stopAlarm();


    hideEmergencyAlert();


    /*
    --------------------------------------------------------
    RESET SERVER
    --------------------------------------------------------
    */

    await resetServer();


    /*
    --------------------------------------------------------
    BUTTONS
    --------------------------------------------------------
    */

    const startBtn =
        getElement("startBtn");

    const stopBtn =
        getElement("stopBtn");


    if (startBtn) {

        startBtn.disabled =
            false;
    }


    if (stopBtn) {

        stopBtn.disabled =
            true;
    }


    setStatus(
        "⏹ Tracking stopped"
    );
}


/* =========================================================
   CONFIRM SAFE
========================================================= */

async function confirmSafe() {

    console.log(
        "================================"
    );

    console.log(
        "CONFIRM SAFE BUTTON CLICKED"
    );

    console.log(
        "================================"
    );


    hideEmergencyAlert();


    try {

        const response =
            await postJSON(

                "/confirm-safe",

                {
                    user_id:
                        userId
                }
            );


        console.log(
            "Confirm safe response:",
            response
        );


        setStatus(
            "✅ You are safe. Monitoring continues."
        );

    }
    catch (error) {

        console.error(
            "Confirm safe error:",
            error
        );


        setStatus(
            "✅ Safety confirmed. Monitoring continues."
        );
    }
}


/* =========================================================
   REPORT EMERGENCY
========================================================= */

async function reportEmergency() {

    console.log(
        "================================"
    );

    console.log(
        "🚨 REPORT EMERGENCY CLICKED"
    );

    console.log(
        "================================"
    );


    let latitude = null;
    let longitude = null;


    /*
    --------------------------------------------------------
    GET CURRENT GPS
    --------------------------------------------------------
    */

    if (currentPosition) {

        const lat =
            Number(
                currentPosition.latitude
            );

        const lon =
            Number(
                currentPosition.longitude
            );


        if (
            Number.isFinite(lat)
            &&
            Number.isFinite(lon)
        ) {

            latitude =
                lat;

            longitude =
                lon;
        }
    }


    /*
    --------------------------------------------------------
    CONFIRM
    --------------------------------------------------------
    */

    const confirmed =
        window.confirm(

            "🚨 Report emergency now?\n\n" +

            "An emergency SMS will be sent to your emergency contact."
        );


    if (!confirmed) {

        console.log(
            "Emergency cancelled."
        );

        return;
    }


    setStatus(
        "🚨 Sending emergency SMS..."
    );


    try {

        const response =
            await postJSON(

                "/report-emergency",

                {

                    user_id:
                        userId,

                    latitude:
                        latitude,

                    longitude:
                        longitude,

                    reason:
                        "User manually reported an emergency."
                }
            );


        console.log(
            "Emergency response:",
            response
        );


        if (
            response.sms_sent === true
        ) {

            hideEmergencyAlert();


            setStatus(
                "🚨 Emergency SMS sent successfully."
            );


            window.alert(
                "🚨 Emergency SMS sent successfully."
            );

        }
        else {

            setStatus(
                "⚠ Emergency received, but SMS was not sent."
            );


            window.alert(

                response.message ||

                "Emergency request received, but SMS could not be sent."
            );
        }

    }
    catch (error) {

        console.error(
            "Emergency request error:",
            error
        );


        setStatus(
            "❌ Emergency request failed."
        );


        window.alert(

            "Emergency request failed:\n\n" +
            error.message
        );
    }
}


/* =========================================================
   DEVICE SHAKE
========================================================= */

async function enableDeviceShake() {

    try {

        /*
        ----------------------------------------------------
        iOS permission
        ----------------------------------------------------
        */

        if (
            typeof DeviceMotionEvent !==
            "undefined"
            &&
            typeof DeviceMotionEvent.requestPermission ===
            "function"
        ) {

            const permission =
                await DeviceMotionEvent.requestPermission();


            if (
                permission !==
                "granted"
            ) {

                console.warn(
                    "DeviceMotion permission denied."
                );

                return;
            }
        }


        /*
        ----------------------------------------------------
        REMOVE OLD LISTENER
        ----------------------------------------------------
        */

        window.removeEventListener(
            "devicemotion",
            handleDeviceMotion
        );


        /*
        ----------------------------------------------------
        ADD LISTENER
        ----------------------------------------------------
        */

        window.addEventListener(

            "devicemotion",

            handleDeviceMotion,

            {
                passive: true
            }
        );


        console.log(
            "📱 Device Shake detection enabled."
        );

    }
    catch (error) {

        console.error(
            "DeviceMotion setup failed:",
            error
        );
    }
}


/* =========================================================
   DEVICE MOTION HANDLER
========================================================= */

async function handleDeviceMotion(
    event
) {

    if (!tracking) {
        return;
    }


    const acceleration =
        event.accelerationIncludingGravity;


    if (!acceleration) {
        return;
    }


    const x =
        safeNumber(
            acceleration.x
        );

    const y =
        safeNumber(
            acceleration.y
        );

    const z =
        safeNumber(
            acceleration.z
        );


    const magnitude =
        Math.sqrt(
            x * x +
            y * y +
            z * z
        );


    const now =
        Date.now();


    /*
    --------------------------------------------------------
    SHAKE THRESHOLD
    --------------------------------------------------------
    */

    if (
        magnitude <
        SHAKE_THRESHOLD
    ) {

        return;
    }


    /*
    --------------------------------------------------------
    COOLDOWN
    --------------------------------------------------------
    */

    if (
        now -
        shakeLastTime <
        SHAKE_COOLDOWN
    ) {

        return;
    }


    shakeLastTime =
        now;


    console.log(
        "📱 DEVICE SHAKE DETECTED:",
        magnitude
    );


    try {

        const response =
            await postJSON(

                "/movement",

                {

                    user_id:
                        userId,

                    source:
                        "Device Shake",

                    gps_available:
                        !!currentPosition,

                    latitude:
                        currentPosition
                            ?.latitude ??
                        null,

                    longitude:
                        currentPosition
                            ?.longitude ??
                        null,

                    accuracy:
                        currentPosition
                            ?.accuracy ??
                        null,

                    altitude:
                        currentPosition
                            ?.altitude ??
                        null,

                    timestamp:
                        Date.now(),

                    distance:
                        magnitude,

                    speed:
                        currentSpeed,

                    previous_speed:
                        previousSpeed,

                    speed_change:
                        0,

                    acceleration:
                        magnitude,

                    direction:
                        currentBearing
                }
            );


        console.log(
            "Device Shake response:",
            response
        );


        /*
        ----------------------------------------------------
        ALWAYS SHOW ALERT FOR TESTING
        ----------------------------------------------------
        */

        showEmergencyAlert(

            "📱 Device shake detected. Please confirm that you are safe.",

            response
        );

    }
    catch (error) {

        console.error(
            "Device Shake backend error:",
            error
        );


        /*
        ----------------------------------------------------
        SHOW ALERT EVEN IF BACKEND FAILS
        ----------------------------------------------------
        */

        showEmergencyAlert(

            "📱 Device shake detected. Please confirm that you are safe.",

            {
                risk_score:
                    50,

                risk_level:
                    "HIGH",

                emergency_risk:
                    "HIGH"
            }
        );
    }
}


/* =========================================================
   MANUAL SHAKE TEST
========================================================= */

async function testDeviceShake() {

    console.log(
        "Manual shake test."
    );


    try {

        const response =
            await postJSON(

                "/movement",

                {

                    user_id:
                        userId,

                    source:
                        "Device Shake",

                    gps_available:
                        !!currentPosition,

                    latitude:
                        currentPosition
                            ?.latitude ??
                        null,

                    longitude:
                        currentPosition
                            ?.longitude ??
                        null,

                    accuracy:
                        currentPosition
                            ?.accuracy ??
                        null,

                    altitude:
                        currentPosition
                            ?.altitude ??
                        null,

                    timestamp:
                        Date.now(),

                    distance:
                        20,

                    speed:
                        currentSpeed,

                    previous_speed:
                        previousSpeed,

                    speed_change:
                        0,

                    acceleration:
                        20,

                    direction:
                        currentBearing
                }
            );


        showEmergencyAlert(

            "📱 Device shake test detected. Please confirm that you are safe.",

            response
        );

    }
    catch (error) {

        console.error(
            "Manual shake test error:",
            error
        );


        showEmergencyAlert(

            "📱 Device shake test detected.",

            {
                risk_score:
                    50,

                risk_level:
                    "HIGH",

                emergency_risk:
                    "HIGH"
            }
        );
    }
}


/* =========================================================
   BUTTON SETUP
========================================================= */

function setupButtons() {

    /*
    --------------------------------------------------------
    IMPORTANT:
    These IDs EXACTLY match your HTML
    --------------------------------------------------------
    */

    const startBtn =
        getElement("startBtn");

    const stopBtn =
        getElement("stopBtn");

    const safeBtn =
        getElement("safeBtn");

    const emergencyBtn =
        getElement("emergencyBtn");


    console.log(
        "Button check:",
        {
            startBtn:
                !!startBtn,

            stopBtn:
                !!stopBtn,

            safeBtn:
                !!safeBtn,

            emergencyBtn:
                !!emergencyBtn
        }
    );


    /*
    --------------------------------------------------------
    START BUTTON
    --------------------------------------------------------
    */

    if (startBtn) {

        startBtn.addEventListener(

            "click",

            function(event) {

                event.preventDefault();

                console.log(
                    "START BUTTON CLICKED"
                );

                startTracking();
            }
        );
    }
    else {

        console.error(
            "❌ startBtn not found"
        );
    }


    /*
    --------------------------------------------------------
    STOP BUTTON
    --------------------------------------------------------
    */

    if (stopBtn) {

        stopBtn.addEventListener(

            "click",

            function(event) {

                event.preventDefault();

                console.log(
                    "STOP BUTTON CLICKED"
                );

                stopTracking();
            }
        );
    }
    else {

        console.error(
            "❌ stopBtn not found"
        );
    }


    /*
    --------------------------------------------------------
    CONFIRM SAFE BUTTON
    --------------------------------------------------------
    */

    if (safeBtn) {

        safeBtn.addEventListener(

            "click",

            function(event) {

                event.preventDefault();

                console.log(
                    "✅ SAFE BUTTON CLICKED"
                );

                confirmSafe();
            }
        );
    }
    else {

        console.error(
            "❌ safeBtn not found"
        );
    }


    /*
    --------------------------------------------------------
    EMERGENCY BUTTON
    --------------------------------------------------------
    */

    if (emergencyBtn) {

        emergencyBtn.addEventListener(

            "click",

            function(event) {

                event.preventDefault();

                console.log(
                    "🚨 EMERGENCY BUTTON CLICKED"
                );

                reportEmergency();
            }
        );
    }
    else {

        console.error(
            "❌ emergencyBtn not found"
        );
    }


    /*
    --------------------------------------------------------
    INITIAL BUTTON STATE
    --------------------------------------------------------
    */

    if (startBtn) {

        startBtn.disabled =
            false;
    }


    if (stopBtn) {

        stopBtn.disabled =
            true;
    }
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(

    "DOMContentLoaded",

    function() {

        console.log(
            "======================================"
        );

        console.log(
            "SafeRoute AI initialized."
        );

        console.log(
            "User ID:",
            userId
        );

        console.log(
            "======================================"
        );


        /*
        ----------------------------------------------------
        SETUP BUTTONS
        ----------------------------------------------------
        */

        setupButtons();


        /*
        ----------------------------------------------------
        HIDE ALERT INITIALLY
        ----------------------------------------------------
        */

        hideEmergencyAlert();
    }
);


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.startTracking =
    startTracking;

window.stopTracking =
    stopTracking;

window.confirmSafe =
    confirmSafe;

window.reportEmergency =
    reportEmergency;

window.testDeviceShake =
    testDeviceShake;

window.showEmergencyAlert =
    showEmergencyAlert;

window.hideEmergencyAlert =
    hideEmergencyAlert;



const emergencyMainBtn =
    document.getElementById("emergencyMainBtn");

if (emergencyMainBtn) {

    emergencyMainBtn.addEventListener("click", async function () {

        console.log("🚨 EMERGENCY BUTTON CLICKED");

        emergencyMainBtn.disabled = true;
        emergencyMainBtn.textContent = "🚨 SENDING...";

        let latitude = null;
        let longitude = null;

        // Get latest GPS location if available
        if (currentPosition) {
            latitude = currentPosition.latitude;
            longitude = currentPosition.longitude;
        }

        try {

            const response = await postJSON(
                "/report-emergency",
                {
                    user_id: userId,
                    latitude: latitude,
                    longitude: longitude,
                    reason: "Emergency button manually pressed by user."
                }
            );

            console.log(
                "Emergency response:",
                response
            );

            if (response.sms_sent === true) {

                emergencyMainBtn.textContent =
                    "✅ EMERGENCY SMS SENT";

                alert(
                    "🚨 Emergency SMS sent successfully!"
                );

            } else {

                emergencyMainBtn.textContent =
                    "⚠ SMS NOT SENT";

                alert(
                    response.message ||
                    "Emergency request received, but SMS was not sent."
                );
            }

        } catch (error) {

            console.error(
                "Emergency error:",
                error
            );

            emergencyMainBtn.textContent =
                "❌ FAILED";

            alert(
                "Emergency request failed:\n\n" +
                error.message
            );

        } finally {

            setTimeout(function () {

                emergencyMainBtn.disabled =
                    false;

                emergencyMainBtn.textContent =
                    "🚨 EMERGENCY";

            }, 3000);
        }
    });
}