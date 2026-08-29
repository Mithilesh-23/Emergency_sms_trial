/* =========================================================
   SAFEROUTE AI - FEATURE 2
   GPS MOVEMENT & SAFETY MONITOR
   Browser -> Flask -> Safety Engine -> Twilio
   ========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const API_BASE = "";
const USER_ID_KEY = "saferoute_feature2_user_id";

const MAX_ACCEPTABLE_ACCURACY = 50;

const GPS_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000
};

/*
   IMPORTANT:
   0 = extremely sensitive testing.
   Any non-zero GPS movement can trigger detection.

   Later you can change this to:
   0.05
   0.3
   1
   etc.
*/
const MIN_MOVEMENT_METERS = 0.3;

const MIN_DIRECTION_DISTANCE = 0.5;

const ALARM_COOLDOWN = 10000;

/* =========================================================
   STATE
   ========================================================= */

let watchId = null;
let tracking = false;

let firstPosition = null;
let previousPosition = null;
let currentPosition = null;

let previousSpeed = 0;
let currentSpeed = 0;

let totalDistance = 0;

let lastAlarmTime = 0;

let audioContext = null;
let alarmInterval = null;
let alarmStopTimer = null;

let notificationPermissionRequested = false;
let emergencyAlertActive = false;

const userId = getUserId();

/* =========================================================
   USER ID
   ========================================================= */

function getUserId() {
    try {
        let id = localStorage.getItem(USER_ID_KEY);

        if (!id) {
            id = "browser_" + crypto.randomUUID();
            localStorage.setItem(USER_ID_KEY, id);
        }

        return id;

    } catch (error) {

        console.warn(
            "localStorage/crypto unavailable:",
            error
        );

        return "browser_default";
    }
}

/* =========================================================
   DOM HELPERS
   ========================================================= */

function findElement(...selectors) {

    for (const selector of selectors) {

        const element =
            document.querySelector(selector);

        if (element) {
            return element;
        }
    }

    return null;
}

/* =========================================================
   BUTTONS
   ========================================================= */

const startButton = findElement(
    "#startTracking",
    "#startBtn",
    "#start-tracking",
    "[data-action='start-tracking']",
    "button.start-tracking"
);

const stopButton = findElement(
    "#stopTracking",
    "#stopBtn",
    "#stop-tracking",
    "[data-action='stop-tracking']",
    "button.stop-tracking"
);

const statusElement = findElement(
    "#trackingStatus",
    "#status",
    "#gpsStatus",
    "#statusMessage",
    ".status-message",
    ".status-box",
    ".status"
);

/* =========================================================
   DATA ELEMENTS
   ========================================================= */

const elements = {

    currentSpeed:
        findElement(
            "#currentSpeed",
            "[data-field='currentSpeed']"
        ),

    rawSpeed:
        findElement(
            "#rawSpeed",
            "[data-field='rawSpeed']"
        ),

    previousSpeed:
        findElement(
            "#previousSpeed",
            "[data-field='previousSpeed']"
        ),

    speedChange:
        findElement(
            "#speedChange",
            "[data-field='speedChange']"
        ),

    acceleration:
        findElement(
            "#acceleration",
            "[data-field='acceleration']"
        ),

    direction:
        findElement(
            "#direction",
            "[data-field='direction']"
        ),

    directionChange:
        findElement(
            "#directionChange",
            "[data-field='directionChange']"
        ),

    distance:
        findElement(
            "#distance",
            "[data-field='distance']"
        ),

    timeInterval:
        findElement(
            "#timeInterval",
            "[data-field='timeInterval']"
        ),

    latitude:
        findElement(
            "#latitude",
            "[data-field='latitude']"
        ),

    longitude:
        findElement(
            "#longitude",
            "[data-field='longitude']"
        ),

    accuracy:
        findElement(
            "#gpsAccuracy",
            "#accuracy",
            "[data-field='accuracy']"
        ),

    gpsValid:
        findElement("#gpsValid"),

    riskScore:
        findElement("#riskScore"),

    movementRisk:
        findElement("#movementRisk"),

    movementMessage:
        findElement("#movementMessage"),

    confirmationCount:
        findElement("#confirmationCount"),

    speedAlert:
        findElement("#speedAlert"),

    decelerationAlert:
        findElement("#decelerationAlert"),

    directionAlert:
        findElement("#directionAlert"),

    movementReasons:
        findElement("#movementReasons"),

    speedHistory:
        findElement("#speedHistory"),

    timestamp:
        findElement("#timestamp")
};

/* =========================================================
   SAFETY ALERT ELEMENTS
   ========================================================= */

const safetyAlert =
    findElement("#safetyAlert");

const safetyAlertMessage =
    findElement("#safetyAlertMessage");

const alertReasons =
    findElement("#alertReasons");

const alertRiskScore =
    findElement("#alertRiskScore");

const emergencyActivated =
    findElement("#emergencyActivated");

/* =========================================================
   HELPERS
   ========================================================= */

function updateElement(element, value) {

    if (element) {
        element.textContent = value;
    }
}

function setStatus(
    message,
    type = "normal"
) {

    if (statusElement) {

        statusElement.textContent =
            message;

        statusElement.classList.remove(
            "status-success",
            "status-warning",
            "status-danger",
            "status-error",
            "success",
            "warning",
            "danger",
            "error"
        );

        if (type === "success") {

            statusElement.classList.add(
                "status-success"
            );

        } else if (type === "warning") {

            statusElement.classList.add(
                "status-warning"
            );

        } else if (type === "danger") {

            statusElement.classList.add(
                "status-danger"
            );

        } else if (type === "error") {

            statusElement.classList.add(
                "status-error"
            );
        }
    }

    console.log(
        "[SafeRoute]",
        message
    );
}

/* =========================================================
   BUTTON STATE
   ========================================================= */

function updateButtonState() {

    if (startButton) {

        startButton.disabled =
            tracking;

        startButton.style.opacity =
            tracking ? "0.6" : "1";

        startButton.style.cursor =
            tracking
                ? "not-allowed"
                : "pointer";
    }

    if (stopButton) {

        stopButton.disabled =
            !tracking;

        stopButton.style.opacity =
            tracking ? "1" : "0.6";

        stopButton.style.cursor =
            tracking
                ? "pointer"
                : "not-allowed";
    }
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

            console.warn(
                "Web Audio API unavailable."
            );

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

        console.log(
            "Audio system ready:",
            audioContext.state
        );

    } catch (error) {

        console.error(
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

        if (
            audioContext.state ===
            "suspended"
        ) {
            return;
        }

        const oscillator =
            audioContext.createOscillator();

        const gain =
            audioContext.createGain();

        const now =
            audioContext.currentTime;

        oscillator.type = "sine";

        oscillator.frequency.setValueAtTime(
            900,
            now
        );

        oscillator.frequency.exponentialRampToValueAtTime(
            500,
            now + 0.8
        );

        gain.gain.setValueAtTime(
            0.0001,
            now
        );

        gain.gain.exponentialRampToValueAtTime(
            0.8,
            now + 0.02
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + 0.8
        );

        oscillator.connect(gain);

        gain.connect(
            audioContext.destination
        );

        oscillator.start(now);

        oscillator.stop(
            now + 0.8
        );

    } catch (error) {

        console.error(
            "Bell sound error:",
            error
        );
    }
}

/* =========================================================
   ALARM
   ========================================================= */

function startAlarm(
    reason,
    response = null
) {

    const now =
        Date.now();

    if (
        now - lastAlarmTime <
        ALARM_COOLDOWN
    ) {
        return;
    }

    lastAlarmTime =
        now;

    emergencyAlertActive =
        true;

    stopAlarm();

    playBell();

    alarmInterval =
        setInterval(
            playBell,
            1200
        );

    alarmStopTimer =
        setTimeout(
            () => {
                stopAlarm();
            },
            10000
        );

    showSafetyAlert(
        reason,
        response
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

    if (alarmStopTimer) {

        clearTimeout(
            alarmStopTimer
        );

        alarmStopTimer = null;
    }
}

/* =========================================================
   SAFETY ALERT UI
   ========================================================= */

function showSafetyAlert(
    reason,
    response = null
) {

    if (safetyAlert) {

        safetyAlert.classList.remove(
            "d-none"
        );

        safetyAlert.style.display =
            "block";
    }

    updateElement(
        safetyAlertMessage,
        reason ||
        "Movement detected."
    );

    if (response) {

        updateElement(
            alertRiskScore,
            response.risk_score ?? "-"
        );

        if (alertReasons) {

            if (
                Array.isArray(
                    response.reasons
                )
            ) {

                alertReasons.textContent =
                    response.reasons.join(
                        ", "
                    );

            } else {

                alertReasons.textContent =
                    response.reasons || "";
            }
        }
    }

    setStatus(
        "⚠️ Safety alert: Movement detected",
        "danger"
    );
}

/* =========================================================
   HIDE SAFETY ALERT
   ========================================================= */

function hideEmergencyAlert() {

    emergencyAlertActive =
        false;

    stopAlarm();

    if (safetyAlert) {

        safetyAlert.classList.add(
            "d-none"
        );

        safetyAlert.style.display =
            "none";
    }
}

/* =========================================================
   NOTIFICATION
   ========================================================= */

async function requestNotificationPermission() {

    if (
        !("Notification" in window)
    ) {
        return;
    }

    if (
        notificationPermissionRequested
    ) {
        return;
    }

    notificationPermissionRequested =
        true;

    try {

        if (
            Notification.permission ===
            "default"
        ) {

            await Notification.requestPermission();
        }

    } catch (error) {

        console.warn(
            "Notification permission error:",
            error
        );
    }
}

/* =========================================================
   SHOW NOTIFICATION
   ========================================================= */

function showNotification(
    title,
    body
) {

    if (
        !("Notification" in window)
    ) {
        return;
    }

    if (
        Notification.permission !==
        "granted"
    ) {
        return;
    }

    try {

        new Notification(
            title,
            {
                body: body,
                tag: "saferoute-alert"
            }
        );

    } catch (error) {

        console.warn(
            "Notification failed:",
            error
        );
    }
}

/* =========================================================
   HAVERSINE DISTANCE
   ========================================================= */

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R =
        6371000;

    const toRadians =
        degrees =>
            degrees *
            Math.PI /
            180;

    const dLat =
        toRadians(
            lat2 - lat1
        );

    const dLon =
        toRadians(
            lon2 - lon1
        );

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(
            toRadians(lat1)
        ) *
        Math.cos(
            toRadians(lat2)
        ) *
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

    const toRadians =
        degrees =>
            degrees *
            Math.PI /
            180;

    const toDegrees =
        radians =>
            radians *
            180 /
            Math.PI;

    const phi1 =
        toRadians(lat1);

    const phi2 =
        toRadians(lat2);

    const deltaLambda =
        toRadians(
            lon2 - lon1
        );

    const y =
        Math.sin(deltaLambda) *
        Math.cos(phi2);

    const x =
        Math.cos(phi1) *
        Math.sin(phi2) -
        Math.sin(phi1) *
        Math.cos(phi2) *
        Math.cos(deltaLambda);

    let bearing =
        toDegrees(
            Math.atan2(y, x)
        );

    return (
        bearing + 360
    ) % 360;
}

/* =========================================================
   GPS ERROR
   ========================================================= */

function handleGPSError(
    error
) {

    console.warn(
        "GPS error:",
        error
    );

    if (
        error &&
        error.code ===
        1
    ) {

        setStatus(
            "GPS permission denied.",
            "error"
        );

    } else if (
        error &&
        error.code ===
        2
    ) {

        setStatus(
            "GPS currently unavailable.",
            "warning"
        );

    } else if (
        error &&
        error.code ===
        3
    ) {

        setStatus(
            "GPS request timed out.",
            "warning"
        );

    } else {

        setStatus(
            "Unable to obtain GPS location.",
            "error"
        );
    }
}

/* =========================================================
   UPDATE GPS UI
   ========================================================= */

function updateGPSUI(
    position
) {

    const coords =
        position.coords;

    updateElement(
        elements.latitude,
        coords.latitude.toFixed(6)
    );

    updateElement(
        elements.longitude,
        coords.longitude.toFixed(6)
    );

    updateElement(
        elements.accuracy,
        `${coords.accuracy.toFixed(2)} m`
    );

    if (
        elements.gpsValid
    ) {

        elements.gpsValid.textContent =
            coords.accuracy <=
            MAX_ACCEPTABLE_ACCURACY
                ? "Valid"
                : "Low accuracy";
    }

    updateElement(
        elements.timestamp,
        new Date(
            position.timestamp
        ).toLocaleString()
    );
}

/* =========================================================
   SEND MOVEMENT TO FLASK
   ========================================================= */

async function sendMovementToServer(
    movement
) {

    try {

        const response =
            await fetch(
                `${API_BASE}/movement`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            movement
                        )
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Movement API failed."
            );
        }

        return data;

    } catch (error) {

        console.error(
            "Movement API error:",
            error
        );

        return null;
    }
}

/* =========================================================
   PROCESS GPS POSITION
   ========================================================= */

async function processPosition(
    position
) {

    currentPosition =
        position;

    updateGPSUI(
        position
    );

    const coords =
        position.coords;

    const latitude =
        coords.latitude;

    const longitude =
        coords.longitude;

    const accuracy =
        coords.accuracy;

    const timestamp =
        position.timestamp;

    const speed =
        Number.isFinite(
            coords.speed
        )
            ? Math.max(
                0,
                coords.speed
            )
            : 0;

    currentSpeed =
        speed;

    /* =====================================================
       FIRST GPS POSITION
       ===================================================== */

    if (!firstPosition) {

        firstPosition =
            position;

        previousPosition =
            position;

        previousSpeed =
            speed;

        totalDistance =
            0;

        setStatus(
            "🟢 GPS tracking active.",
            "success"
        );

        return;
    }

    /* =====================================================
       PREVIOUS POSITION
       ===================================================== */

    const previousCoords =
        previousPosition.coords;

    const distance =
        calculateDistance(
            previousCoords.latitude,
            previousCoords.longitude,
            latitude,
            longitude
        );

    const timeDifference =
        Math.max(
            (
                timestamp -
                previousPosition.timestamp
            ) / 1000,
            0.001
        );

    const calculatedSpeed =
        distance /
        timeDifference;

    const speedChange =
        speed -
        previousSpeed;

    const acceleration =
        speedChange /
        timeDifference;

    let direction =
        null;

    if (
        distance >=
        MIN_DIRECTION_DISTANCE
    ) {

        direction =
            calculateBearing(
                previousCoords.latitude,
                previousCoords.longitude,
                latitude,
                longitude
            );
    }

    const movementDetected =
        distance >
        MIN_MOVEMENT_METERS;

    if (movementDetected) {

        totalDistance +=
            distance;
    }

    /* =====================================================
       UPDATE UI
       ===================================================== */

    updateElement(
        elements.currentSpeed,
        `${speed.toFixed(2)} m/s`
    );

    updateElement(
        elements.rawSpeed,
        `${calculatedSpeed.toFixed(2)} m/s`
    );

    updateElement(
        elements.previousSpeed,
        `${previousSpeed.toFixed(2)} m/s`
    );

    updateElement(
        elements.speedChange,
        `${speedChange.toFixed(2)} m/s`
    );

    updateElement(
        elements.acceleration,
        `${acceleration.toFixed(2)} m/s²`
    );

    updateElement(
        elements.distance,
        `${distance.toFixed(2)} m`
    );

    updateElement(
        elements.timeInterval,
        `${timeDifference.toFixed(2)} s`
    );

    updateElement(
        elements.direction,
        direction !== null
            ? `${direction.toFixed(1)}°`
            : "-"
    );

    updateElement(
        elements.timestamp,
        new Date(
            timestamp
        ).toLocaleString()
    );

    /* =====================================================
       SEND TO FLASK
       ===================================================== */

    const movementData = {

        user_id:
            userId,

        source:
            "GPS",

        gps_available:
            true,

        latitude:
            latitude,

        longitude:
            longitude,

        accuracy:
            accuracy,

        altitude:
            coords.altitude,

        timestamp:
            timestamp,

        distance:
            distance,

        speed:
            speed,

        previous_speed:
            previousSpeed,

        speed_change:
            speedChange,

        acceleration:
            acceleration,

        direction:
            direction
    };

    const response =
        await sendMovementToServer(
            movementData
        );

    /* =====================================================
       SAFETY RESPONSE
       ===================================================== */

    if (
        response &&
        response.success
    ) {

        updateElement(
            elements.riskScore,
            response.risk_score ?? "-"
        );

        updateElement(
            elements.movementRisk,
            response.emergency_risk ||
            response.risk_level ||
            "-"
        );

        updateElement(
            elements.movementMessage,
            response.message ||
            "-"
        );

        if (
            response.speed_alert !==
            undefined
        ) {

            updateElement(
                elements.speedAlert,
                response.speed_alert
                    ? "YES"
                    : "NO"
            );
        }

        if (
            response.deceleration_alert !==
            undefined
        ) {

            updateElement(
                elements.decelerationAlert,
                response.deceleration_alert
                    ? "YES"
                    : "NO"
            );
        }

        if (
            response.direction_alert !==
            undefined
        ) {

            updateElement(
                elements.directionAlert,
                response.direction_alert
                    ? "YES"
                    : "NO"
            );
        }

        if (
            Array.isArray(
                response.reasons
            )
        ) {

            updateElement(
                elements.movementReasons,
                response.reasons.join(
                    ", "
                )
            );
        }
    }

    /* =====================================================
       MOVEMENT ALERT
       ===================================================== */

    if (movementDetected) {

        const reason =
            response &&
            response.message
                ? response.message
                : `Movement detected: ${distance.toFixed(2)} m`;

        startAlarm(
            reason,
            response
        );

        showNotification(
            "SafeRoute Safety Alert",
            reason
        );

        setStatus(
            `⚠️ Movement detected: ${distance.toFixed(2)} m`,
            "danger"
        );
    }

    previousPosition =
        position;

    previousSpeed =
        speed;
}

/* =========================================================
   GPS WATCH
   ========================================================= */

function startGPSWatch() {

    if (
        !("geolocation" in navigator)
    ) {

        setStatus(
            "Geolocation is not supported by this browser.",
            "error"
        );

        return;
    }

    watchId =
        navigator.geolocation.watchPosition(
            processPosition,
            handleGPSError,
            GPS_OPTIONS
        );
}

/* =========================================================
   RESET SERVER TRACKING
   ========================================================= */

async function resetServerTracking() {

    try {

        await fetch(
            `${API_BASE}/reset`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        user_id:
                            userId
                    })
            }
        );

    } catch (error) {

        console.warn(
            "Server reset failed:",
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

    tracking =
        true;

    firstPosition =
        null;

    previousPosition =
        null;

    currentPosition =
        null;

    previousSpeed =
        0;

    currentSpeed =
        0;

    totalDistance =
        0;

    emergencyAlertActive =
        false;

    hideEmergencyAlert();

    updateButtonState();

    setStatus(
        "🟡 Starting GPS tracking...",
        "warning"
    );

    await initializeAudio();

    await requestNotificationPermission();

    await resetServerTracking();

    startGPSWatch();

    setStatus(
        "🟢 Tracking started. Waiting for GPS...",
        "success"
    );
}

/* =========================================================
   STOP TRACKING
   ========================================================= */

async function stopTracking() {

    if (!tracking) {
        return;
    }

    tracking =
        false;

    if (
        watchId !== null
    ) {

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId =
            null;
    }

    stopAlarm();

    hideEmergencyAlert();

    firstPosition =
        null;

    previousPosition =
        null;

    currentPosition =
        null;

    previousSpeed =
        0;

    currentSpeed =
        0;

    totalDistance =
        0;

    await resetServerTracking();

    setStatus(
        "🔴 Tracking stopped",
        "normal"
    );

    updateButtonState();
}

/* =========================================================
   CONFIRM SAFE
   ========================================================= */

async function confirmSafe() {

    stopAlarm();

    emergencyAlertActive =
        false;

    try {

        const response =
            await fetch(
                `${API_BASE}/confirm-safe`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            user_id:
                                userId
                        })
                }
            );

        const data =
            await response.json();

        hideEmergencyAlert();

        setStatus(
            data.message ||
            "Safety confirmed. Monitoring continues.",
            "success"
        );

    } catch (error) {

        console.error(
            "Confirm safe error:",
            error
        );

        hideEmergencyAlert();

        setStatus(
            "Safety confirmed locally. Monitoring continues.",
            "success"
        );
    }
}

/* =========================================================
   REPORT EMERGENCY
   ========================================================= */

async function reportEmergency() {

    /*
       IMPORTANT FIX:
       GPS is OPTIONAL for a manual emergency.

       If GPS exists, send it.
       If GPS is unavailable, still send
       the emergency request.
    */

    let latitude = null;
    let longitude = null;

    if (currentPosition) {

        const coords =
            currentPosition.coords;

        if (
            Number.isFinite(
                coords.latitude
            ) &&
            Number.isFinite(
                coords.longitude
            )
        ) {

            latitude =
                coords.latitude;

            longitude =
                coords.longitude;
        }
    }

    const confirmed =
        window.confirm(
            "Report an emergency now?\n\n" +
            "An emergency SMS will be sent to your emergency contact."
        );

    if (!confirmed) {
        return;
    }

    setStatus(
        "🚨 Sending emergency alert...",
        "danger"
    );

    if (emergencyActivated) {

        emergencyActivated.textContent =
            "Sending...";
    }

    try {

        const response =
            await fetch(
                `${API_BASE}/report-emergency`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            user_id:
                                userId,

                            latitude:
                                latitude,

                            longitude:
                                longitude,

                            reason:
                                latitude !== null &&
                                longitude !== null
                                    ? "User manually reported an emergency."
                                    : "User manually reported an emergency; GPS location was unavailable."
                        })
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Emergency request failed."
            );
        }

        if (
            data.sms_sent
        ) {

            setStatus(
                "🚨 Emergency SMS sent successfully.",
                "danger"
            );

            if (emergencyActivated) {

                emergencyActivated.textContent =
                    "Emergency SMS sent successfully.";
            }

            showNotification(
                "SafeRoute Emergency",
                "Emergency SMS has been sent to your emergency contact."
            );

        } else {

            setStatus(
                "⚠️ Emergency request received, but SMS was not sent.",
                "warning"
            );

            if (emergencyActivated) {

                emergencyActivated.textContent =
                    "Emergency request received, but SMS was not sent.";
            }
        }

    } catch (error) {

        console.error(
            "Emergency reporting error:",
            error
        );

        setStatus(
            "❌ Emergency alert could not be sent.",
            "error"
        );

        if (emergencyActivated) {

            emergencyActivated.textContent =
                "Emergency alert could not be sent.";
        }

        alert(
            "Emergency alert could not be sent.\n\n" +
            error.message
        );
    }
}

/* =========================================================
   DEVICE SHAKE DETECTION
   ========================================================= */

let shakeLastTime = 0;

let shakeX = 0;
let shakeY = 0;
let shakeZ = 0;

const SHAKE_THRESHOLD = 1.5;
const SHAKE_COOLDOWN = 1500;

function handleDeviceMotion(
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
        acceleration.x || 0;

    const y =
        acceleration.y || 0;

    const z =
        acceleration.z || 0;

    const deltaX =
        Math.abs(x - shakeX);

    const deltaY =
        Math.abs(y - shakeY);

    const deltaZ =
        Math.abs(z - shakeZ);

    shakeX = x;
    shakeY = y;
    shakeZ = z;

    const movement =
        Math.sqrt(
            deltaX ** 2 +
            deltaY ** 2 +
            deltaZ ** 2
        );

    const now =
        Date.now();

    if (
        movement >=
        SHAKE_THRESHOLD &&
        now - shakeLastTime >=
        SHAKE_COOLDOWN
    ) {

        shakeLastTime =
            now;

        handleDeviceShake(
            movement
        );
    }
}

/* =========================================================
   DEVICE SHAKE EVENT
   ========================================================= */

async function handleDeviceShake(
    shakeValue
) {

    console.log(
        "Device Shake detected:",
        shakeValue
    );

    const movementData = {

        user_id:
            userId,

        source:
            "Device Shake",

        gps_available:
            !!currentPosition,

        latitude:
            currentPosition
                ? currentPosition.coords.latitude
                : null,

        longitude:
            currentPosition
                ? currentPosition.coords.longitude
                : null,

        accuracy:
            currentPosition
                ? currentPosition.coords.accuracy
                : null,

        altitude:
            currentPosition
                ? currentPosition.coords.altitude
                : null,

        timestamp:
            Date.now(),

        distance:
            shakeValue,

        speed:
            currentPosition &&
            Number.isFinite(
                currentPosition.coords.speed
            )
                ? currentPosition.coords.speed
                : null,

        previous_speed:
            previousSpeed,

        speed_change:
            0,

        acceleration:
            shakeValue,

        direction:
            null
    };

    const response =
        await sendMovementToServer(
            movementData
        );

    const reason =
        "Device Shake detected";

    startAlarm(
        reason,
        response
    );

    showNotification(
        "SafeRoute Safety Alert",
        "Device Shake detected"
    );

    setStatus(
        "⚠️ Device Shake detected",
        "danger"
    );
}

/* =========================================================
   DEVICE MOTION PERMISSION
   ========================================================= */

async function requestMotionPermission() {

    try {

        if (
            typeof DeviceMotionEvent !==
            "undefined" &&
            typeof DeviceMotionEvent.requestPermission ===
            "function"
        ) {

            const permission =
                await DeviceMotionEvent.requestPermission();

            if (
                permission ===
                "granted"
            ) {

                window.addEventListener(
                    "devicemotion",
                    handleDeviceMotion
                );

                console.log(
                    "DeviceMotion permission granted."
                );
            }

        } else {

            window.addEventListener(
                "devicemotion",
                handleDeviceMotion
            );

            console.log(
                "DeviceMotion listener enabled."
            );
        }

    } catch (error) {

        console.warn(
            "DeviceMotion permission error:",
            error
        );
    }
}

/* =========================================================
   BUTTON EVENTS
   ========================================================= */

function setupButtons() {

    if (startButton) {

        startButton.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                await requestMotionPermission();

                await startTracking();
            }
        );
    }

    if (stopButton) {

        stopButton.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                await stopTracking();
            }
        );
    }

    /*
       Support multiple possible
       emergency button IDs.
    */

    const emergencyButton =
        findElement(
            "#reportEmergency",
            "#emergencyButton",
            "#helpButton",
            "#sosButton",
            "#needHelp",
            "[data-action='report-emergency']"
        );

    if (emergencyButton) {

        emergencyButton.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                await reportEmergency();
            }
        );
    }

    /*
       Confirm Safe button.
    */

    const confirmSafeButton =
        findElement(
            "#confirmSafe",
            "#confirmSafeBtn",
            "[data-action='confirm-safe']"
        );

    if (confirmSafeButton) {

        confirmSafeButton.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                await confirmSafe();
            }
        );
    }
}

/* =========================================================
   DEBUG INFORMATION
   ========================================================= */

function printDebugInfo() {

    console.log(
        "================================="
    );

    console.log(
        "SafeRoute AI Feature 2 loaded"
    );

    console.log(
        "Geolocation supported:",
        "geolocation" in navigator
    );

    console.log(
        "DeviceMotion supported:",
        "DeviceMotionEvent" in window
    );

    console.log(
        "Secure context:",
        window.isSecureContext
    );

    console.log(
        "Current URL:",
        window.location.href
    );

    console.log(
        "Movement threshold:",
        MIN_MOVEMENT_METERS,
        "meters"
    );

    console.log(
        "API endpoint:",
        `${window.location.origin}/movement`
    );

    console.log(
        "User ID:",
        userId
    );

    console.log(
        "Notification supported:",
        "Notification" in window
    );

    if (
        "Notification" in window
    ) {

        console.log(
            "Notification permission:",
            Notification.permission
        );
    }

    console.log(
        "================================="
    );
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

function initializeFeature() {

    console.log(
        "Initializing SafeRoute Feature 2..."
    );

    printDebugInfo();

    setupButtons();

    updateButtonState();

    if (safetyAlert) {

        safetyAlert.classList.add(
            "d-none"
        );

        safetyAlert.style.display =
            "none";
    }

    setStatus(
        "Ready. Click Start Tracking to begin GPS monitoring.",
        "normal"
    );
}

/* =========================================================
   START APPLICATION
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeFeature
    );

} else {

    initializeFeature();
}