/* =========================================================
   SAFEROUTE AI
   GPS + MOVEMENT + SAFETY MONITOR
   FULL CORRECTED VERSION
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const MIN_MOVEMENT_METERS = 0.0;

const MIN_DIRECTION_DISTANCE = 0.5;

const MOVEMENT_UPDATE_INTERVAL = 1000;


/* =========================================================
   USER
   ========================================================= */

const userId =
    window.USER_ID ||
    "default_user";


/* =========================================================
   STATE
   ========================================================= */

let tracking = false;

let watchId = null;

let currentPosition = null;

let firstPosition = null;

let previousPosition = null;

let currentSpeed = 0;

let previousSpeed = 0;

let currentBearing = null;

let totalDistance = 0;

let emergencyAlertActive = false;

let movementRequestInProgress = false;


/* =========================================================
   DOM ELEMENT HELPERS
   ========================================================= */

function getElement(...ids) {

    for (const id of ids) {

        const element =
            document.getElementById(id);

        if (element) {
            return element;
        }
    }

    return null;
}


function updateElement(
    element,
    value
) {

    if (!element) {
        return;
    }

    element.textContent = value;
}


/* =========================================================
   COMMON DOM ELEMENTS
   ========================================================= */

let safetyAlert = null;

let safetyAlertMessage = null;

let alertRiskScore = null;

let alertReasons = null;

let emergencyActivated = null;


/* =========================================================
   REFRESH DOM REFERENCES
   ========================================================= */

function refreshEmergencyElements() {

    safetyAlert =
        getElement(
            "safetyAlert",
            "emergencyAlert",
            "emergencyPopup"
        );

    safetyAlertMessage =
        getElement(
            "safetyAlertMessage",
            "emergencyMessage",
            "alertMessage"
        );

    alertRiskScore =
        getElement(
            "alertRiskScore",
            "emergencyRiskScore"
        );

    alertReasons =
        getElement(
            "alertReasons",
            "emergencyReasons"
        );

    emergencyActivated =
        getElement(
            "emergencyActivated",
            "emergencyStatus"
        );
}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(
    message,
    type = "normal"
) {

    const statusElement =
        getElement(
            "status",
            "trackingStatus",
            "gpsStatus",
            "movementStatus"
        );

    if (!statusElement) {

        console.log(
            `[${type}] ${message}`
        );

        return;
    }

    statusElement.textContent =
        message;

    statusElement.classList.remove(
        "success",
        "danger",
        "error",
        "warning",
        "normal"
    );

    statusElement.classList.add(
        type
    );
}


/* =========================================================
   NUMBER HELPERS
   ========================================================= */

function safeNumber(
    value,
    fallback = 0
) {

    const number =
        Number(value);

    return Number.isFinite(number)
        ? number
        : fallback;
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

    const earthRadius = 6371000;

    const p1 =
        lat1 * Math.PI / 180;

    const p2 =
        lat2 * Math.PI / 180;

    const deltaLat =
        (lat2 - lat1)
        * Math.PI / 180;

    const deltaLon =
        (lon2 - lon1)
        * Math.PI / 180;

    const a =
        Math.sin(deltaLat / 2) *
        Math.sin(deltaLat / 2)
        +
        Math.cos(p1) *
        Math.cos(p2) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;
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

    const p1 =
        lat1 * Math.PI / 180;

    const p2 =
        lat2 * Math.PI / 180;

    const deltaLon =
        (lon2 - lon1)
        * Math.PI / 180;

    const y =
        Math.sin(deltaLon) *
        Math.cos(p2);

    const x =
        Math.cos(p1) *
        Math.sin(p2)
        -
        Math.sin(p1) *
        Math.cos(p2) *
        Math.cos(deltaLon);

    const bearing =
        Math.atan2(y, x)
        * 180 / Math.PI;

    return (
        bearing + 360
    ) % 360;
}


/* =========================================================
   ANGLE DIFFERENCE
   ========================================================= */

function angleDifference(
    a,
    b
) {

    const difference =
        Math.abs(a - b)
        % 360;

    return Math.min(
        difference,
        360 - difference
    );
}


/* =========================================================
   JSON POST
   ========================================================= */

async function postJSON(
    url,
    data
) {

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

    let result = null;

    try {

        result =
            await response.json();

    } catch (error) {

        result = {};
    }

    if (!response.ok) {

        throw new Error(
            result.error ||
            result.message ||
            `HTTP ${response.status}`
        );
    }

    return result;
}


/* =========================================================
   ALARM
   ========================================================= */

let alarmContext = null;

let alarmOscillator = null;

let alarmGain = null;

let alarmInterval = null;


function startAlarm() {

    try {

        if (
            alarmContext &&
            alarmContext.state !== "closed"
        ) {

            if (
                alarmContext.state ===
                "suspended"
            ) {

                alarmContext.resume();
            }

        } else {

            alarmContext =
                new (
                    window.AudioContext ||
                    window.webkitAudioContext
                )();
        }

        stopAlarm();

        function beep() {

            if (!alarmContext) {
                return;
            }

            alarmOscillator =
                alarmContext.createOscillator();

            alarmGain =
                alarmContext.createGain();

            alarmOscillator.type =
                "sine";

            alarmOscillator.frequency.setValueAtTime(
                880,
                alarmContext.currentTime
            );

            alarmGain.gain.setValueAtTime(
                0.0001,
                alarmContext.currentTime
            );

            alarmGain.gain.exponentialRampToValueAtTime(
                0.3,
                alarmContext.currentTime + 0.03
            );

            alarmGain.gain.exponentialRampToValueAtTime(
                0.0001,
                alarmContext.currentTime + 0.35
            );

            alarmOscillator.connect(
                alarmGain
            );

            alarmGain.connect(
                alarmContext.destination
            );

            alarmOscillator.start();

            alarmOscillator.stop(
                alarmContext.currentTime + 0.4
            );
        }

        beep();

        alarmInterval =
            setInterval(
                beep,
                800
            );

    } catch (error) {

        console.error(
            "Alarm error:",
            error
        );
    }
}


function stopAlarm() {

    if (alarmInterval) {

        clearInterval(
            alarmInterval
        );

        alarmInterval = null;
    }

    try {

        if (alarmOscillator) {

            alarmOscillator.stop();

            alarmOscillator.disconnect();

            alarmOscillator = null;
        }

        if (alarmGain) {

            alarmGain.disconnect();

            alarmGain = null;
        }

    } catch (error) {

        // Already stopped.
    }
}


/* =========================================================
   DYNAMIC EMERGENCY UI
   ========================================================= */

function createEmergencyUI() {

    let panel =
        document.getElementById(
            "saferouteEmergencyPanel"
        );

    if (panel) {

        refreshEmergencyElements();

        return panel;
    }

    panel =
        document.createElement(
            "div"
        );

    panel.id =
        "saferouteEmergencyPanel";

    panel.style.position =
        "fixed";

    panel.style.left =
        "50%";

    panel.style.bottom =
        "20px";

    panel.style.transform =
        "translateX(-50%)";

    panel.style.width =
        "min(92%, 420px)";

    panel.style.background =
        "white";

    panel.style.border =
        "3px solid #dc2626";

    panel.style.borderRadius =
        "18px";

    panel.style.padding =
        "20px";

    panel.style.zIndex =
        "99999";

    panel.style.boxShadow =
        "0 10px 40px rgba(0,0,0,0.30)";

    panel.style.textAlign =
        "center";

    panel.style.fontFamily =
        "Arial, sans-serif";

    panel.innerHTML = `

        <div style="
            font-size:28px;
            font-weight:bold;
            color:#dc2626;
            margin-bottom:10px;
        ">
            ⚠️ SAFETY ALERT
        </div>

        <div
            id="dynamicEmergencyMessage"
            style="
                font-size:16px;
                margin-bottom:12px;
                color:#333;
            "
        >
            Unusual movement detected.
        </div>

        <div
            id="dynamicEmergencyRisk"
            style="
                font-size:14px;
                font-weight:bold;
                margin-bottom:12px;
                color:#991b1b;
            "
        >
            Risk detected
        </div>

        <ul
            id="dynamicEmergencyReasons"
            style="
                text-align:left;
                margin:10px 0 18px 20px;
                color:#444;
                font-size:14px;
            "
        ></ul>

        <button
            id="dynamicReportEmergency"
            type="button"
            style="
                width:100%;
                padding:14px;
                margin-bottom:10px;
                border:0;
                border-radius:12px;
                background:#dc2626;
                color:white;
                font-size:17px;
                font-weight:bold;
                cursor:pointer;
            "
        >
            🚨 I NEED HELP
        </button>

        <button
            id="dynamicConfirmSafe"
            type="button"
            style="
                width:100%;
                padding:14px;
                border:0;
                border-radius:12px;
                background:#16a34a;
                color:white;
                font-size:17px;
                font-weight:bold;
                cursor:pointer;
            "
        >
            ✅ CONFIRM SAFE
        </button>

    `;

    document.body.appendChild(
        panel
    );

    const reportButton =
        document.getElementById(
            "dynamicReportEmergency"
        );

    const safeButton =
        document.getElementById(
            "dynamicConfirmSafe"
        );

    if (reportButton) {

        reportButton.addEventListener(
            "click",
            reportEmergency
        );
    }

    if (safeButton) {

        safeButton.addEventListener(
            "click",
            confirmSafe
        );
    }

    return panel;
}


/* =========================================================
   SHOW EMERGENCY ALERT
   ========================================================= */

function showEmergencyAlert(
    reason,
    response = null
) {

    const panel =
        createEmergencyUI();

    emergencyAlertActive =
        true;

    panel.style.display =
        "block";

    const message =
        document.getElementById(
            "dynamicEmergencyMessage"
        );

    const risk =
        document.getElementById(
            "dynamicEmergencyRisk"
        );

    const reasonsList =
        document.getElementById(
            "dynamicEmergencyReasons"
        );

    if (message) {

        message.textContent =
            reason ||
            response?.message ||
            "Unusual movement detected.";
    }

    if (risk) {

        const score =
            safeNumber(
                response?.risk_score,
                0
            );

        const level =
            response?.emergency_risk ||
            response?.risk_level ||
            "HIGH";

        risk.textContent =
            `Risk Level: ${level} | Score: ${score}`;
    }

    if (reasonsList) {

        reasonsList.innerHTML =
            "";

        const reasons =
            Array.isArray(
                response?.reasons
            )
                ? response.reasons
                : [];

        if (reasons.length === 0) {

            const li =
                document.createElement(
                    "li"
                );

            li.textContent =
                reason ||
                "Unusual movement detected.";

            reasonsList.appendChild(
                li
            );

        } else {

            reasons.forEach(
                item => {

                    const li =
                        document.createElement(
                            "li"
                        );

                    li.textContent =
                        item;

                    reasonsList.appendChild(
                        li
                    );
                }
            );
        }
    }

    startAlarm();

    setStatus(
        "🚨 SAFETY ALERT — Please confirm your safety.",
        "danger"
    );
}


/* =========================================================
   HIDE EMERGENCY ALERT
   ========================================================= */

function hideEmergencyAlert() {

    emergencyAlertActive =
        false;

    stopAlarm();

    const panel =
        document.getElementById(
            "saferouteEmergencyPanel"
        );

    if (panel) {

        panel.style.display =
            "none";
    }
}


/* =========================================================
   CONFIRM SAFE
   ========================================================= */

async function confirmSafe() {

    hideEmergencyAlert();

    try {

        await postJSON(
            "/confirm-safe",
            {
                user_id:
                    userId
            }
        );

        setStatus(
            "✅ Safety confirmed. Monitoring continues.",
            "success"
        );

    } catch (error) {

        console.error(
            "Confirm-safe error:",
            error
        );

        setStatus(
            `⚠️ Could not confirm safe: ${error.message}`,
            "error"
        );
    }
}


/* =========================================================
   REPORT EMERGENCY
   ========================================================= */

async function reportEmergency() {

    let latitude =
        null;

    let longitude =
        null;

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
            Number.isFinite(lat) &&
            Number.isFinite(lon)
        ) {

            latitude =
                lat;

            longitude =
                lon;
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
        "🚨 Sending emergency SMS...",
        "danger"
    );

    try {

        const data =
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
                        latitude !== null &&
                        longitude !== null

                            ? "User manually reported an emergency."

                            : "User manually reported an emergency. GPS location was unavailable."
                }
            );

        console.log(
            "EMERGENCY RESPONSE:",
            data
        );

        if (emergencyActivated) {

            emergencyActivated.classList.remove(
                "d-none"
            );
        }

        if (data.sms_sent) {

            setStatus(
                "🚨 Emergency SMS sent successfully.",
                "danger"
            );

            hideEmergencyAlert();

            alert(
                "🚨 Emergency SMS sent successfully."
            );

        } else {

            setStatus(
                "⚠️ Emergency received, but SMS was not sent.",
                "error"
            );

            alert(
                data.message ||
                "Emergency received, but SMS was not sent."
            );
        }

    } catch (error) {

        console.error(
            "Emergency report error:",
            error
        );

        setStatus(
            `❌ Emergency request failed: ${error.message}`,
            "error"
        );

        alert(
            "Emergency request failed:\n\n" +
            error.message
        );
    }
}


/* =========================================================
   SEND MOVEMENT TO SERVER
   ========================================================= */

async function sendMovementToServer(
    position,
    movementData = {}
) {

    if (
        movementRequestInProgress
    ) {

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

            latitude:
                coords.latitude,

            longitude:
                coords.longitude,

            accuracy:
                safeNumber(
                    coords.accuracy,
                    999
                ),

            timestamp:
                position.timestamp,

            source:
                movementData.source ||
                "GPS",

            gps_available:
                true,

            distance:
                safeNumber(
                    movementData.distance,
                    0
                ),

            speed:
                safeNumber(
                    movementData.speed,
                    currentSpeed
                ),

            previous_speed:
                safeNumber(
                    movementData.previousSpeed,
                    previousSpeed
                ),

            speed_change:
                safeNumber(
                    movementData.speedChange,
                    0
                ),

            acceleration:
                safeNumber(
                    movementData.acceleration,
                    0
                ),

            direction:
                movementData.bearing ??
                currentBearing
        };

        const response =
            await postJSON(
                "/movement",
                payload
            );

        console.log(
            "MOVEMENT RESPONSE:",
            response
        );

        updateMovementUI(
            response
        );

        if (
            response.sudden_movement ||
            response.emergency_risk ===
                "HIGH"
        ) {

            showEmergencyAlert(
                response.message ||
                "Confirmed unusual movement detected.",
                response
            );
        }

        return response;

    } catch (error) {

        console.error(
            "Movement request error:",
            error
        );

        setStatus(
            `⚠️ Movement server error: ${error.message}`,
            "error"
        );

        return null;

    } finally {

        movementRequestInProgress =
            false;
    }
}


/* =========================================================
   MOVEMENT UI
   ========================================================= */

function updateMovementUI(
    response
) {

    if (!response) {
        return;
    }

    const distance =
        response.distance_meters;

    const totalDistance =
        response.total_distance_meters;

    const speed =
        response.speed;

    const riskScore =
        response.risk_score;

    const riskLevel =
        response.emergency_risk ||
        response.risk_level;

    const accuracy =
        response.accuracy;

    updateElement(
        getElement(
            "distance",
            "distanceValue",
            "movementDistance"
        ),
        `${safeNumber(distance).toFixed(2)} m`
    );

    updateElement(
        getElement(
            "totalDistance",
            "totalDistanceValue"
        ),
        `${safeNumber(totalDistance).toFixed(2)} m`
    );

    updateElement(
        getElement(
            "speed",
            "speedValue"
        ),
        `${safeNumber(speed).toFixed(2)} km/h`
    );

    updateElement(
        getElement(
            "riskScore",
            "riskValue"
        ),
        String(
            safeNumber(
                riskScore
            )
        )
    );

    updateElement(
        getElement(
            "riskLevel",
            "riskStatus"
        ),
        riskLevel ||
        "LOW"
    );

    updateElement(
        getElement(
            "gpsAccuracy",
            "accuracyValue"
        ),
        `${safeNumber(accuracy).toFixed(1)} m`
    );
}


/* =========================================================
   GPS ERROR
   ========================================================= */

function handleGPSError(
    error
) {

    console.error(
        "GPS ERROR:",
        error
    );

    if (!tracking) {
        return;
    }

    let message =
        "Unable to get location.";

    switch (
        error.code
    ) {

        case 1:

            message =
                "📍 Location permission denied. Allow Location and start tracking again.";

            break;

        case 2:

            message =
                "📡 GPS position unavailable. Move to an area with a better GPS signal.";

            break;

        case 3:

            message =
                "⏱️ GPS request timed out. Retrying automatically...";

            break;

        default:

            message =
                "⚠️ Unknown GPS error. Retrying...";
    }

    setStatus(
        message,
        "error"
    );
}


/* =========================================================
   GPS POSITION HANDLER
   ========================================================= */

async function handleGPSPosition(
    position
) {

    if (!tracking) {
        return;
    }

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

    const accuracy =
        safeNumber(
            coords.accuracy,
            999
        );

    const timestamp =
        position.timestamp ||
        Date.now();

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        setStatus(
            "❌ Invalid GPS coordinates received.",
            "error"
        );

        return;
    }

    currentPosition = {

        latitude:
            latitude,

        longitude:
            longitude,

        timestamp:
            timestamp,

        accuracy:
            accuracy,

        bearing:
            currentBearing
    };


    /* =====================================================
       FIRST POSITION
       ===================================================== */

    if (!firstPosition) {

        firstPosition = {

            latitude:
                latitude,

            longitude:
                longitude,

            timestamp:
                timestamp,

            accuracy:
                accuracy
        };

        previousPosition =
            currentPosition;

        currentSpeed = 0;

        previousSpeed = 0;

        totalDistance = 0;

        setStatus(
            "✅ GPS position acquired. Connecting to safety engine...",
            "success"
        );

        await sendMovementToServer(
            position,
            {

                distance:
                    0,

                speedChange:
                    0,

                acceleration:
                    0,

                bearing:
                    null
            }
        );

        return;
    }


    /* =====================================================
       DISTANCE
       ===================================================== */

    const clientDistance =
        calculateDistance(
            previousPosition.latitude,
            previousPosition.longitude,
            latitude,
            longitude
        );


    /*
       IMPORTANT:

       Small movements are NOT ignored.

       Even a very small movement is
       sent to the backend.
    */

    const realMovement =
        clientDistance >=
        MIN_MOVEMENT_METERS;


    /* =====================================================
       TIME
       ===================================================== */

    let timeSeconds =
        (
            timestamp -
            previousPosition.timestamp
        ) / 1000;

    if (
        !Number.isFinite(timeSeconds) ||
        timeSeconds <= 0
    ) {

        timeSeconds = 1;
    }


    /* =====================================================
       SPEED
       ===================================================== */

    let clientSpeed =
        safeNumber(
            coords.speed,
            NaN
        );

    if (
        !Number.isFinite(
            clientSpeed
        ) ||
        clientSpeed < 0
    ) {

        if (realMovement) {

            clientSpeed =
                (
                    clientDistance /
                    timeSeconds
                ) * 3.6;

        } else {

            clientSpeed =
                currentSpeed;
        }

    } else {

        clientSpeed =
            clientSpeed * 3.6;
    }


    previousSpeed =
        currentSpeed;

    currentSpeed =
        clientSpeed;


    /* =====================================================
       SPEED CHANGE
       ===================================================== */

    const clientSpeedChange =
        currentSpeed -
        previousSpeed;


    /* =====================================================
       ACCELERATION
       ===================================================== */

    const clientAcceleration =
        (
            (
                currentSpeed -
                previousSpeed
            ) / 3.6
        ) / timeSeconds;


    /* =====================================================
       DIRECTION
       ===================================================== */

    if (
        clientDistance >=
        MIN_DIRECTION_DISTANCE
    ) {

        currentBearing =
            calculateBearing(
                previousPosition.latitude,
                previousPosition.longitude,
                latitude,
                longitude
            );
    }


    /* =====================================================
       TOTAL DISTANCE
       ===================================================== */

    if (realMovement) {

        totalDistance +=
            clientDistance;
    }


    /* =====================================================
       UPDATE CURRENT POSITION
       ===================================================== */

    currentPosition = {

        latitude:
            latitude,

        longitude:
            longitude,

        timestamp:
            timestamp,

        accuracy:
            accuracy,

        bearing:
            currentBearing
    };


    /* =====================================================
       SEND TO SERVER
       ===================================================== */

    previousPosition =
        currentPosition;

    await sendMovementToServer(
        position,
        {

            distance:
                clientDistance,

            speed:
                currentSpeed,

            previousSpeed:
                previousSpeed,

            speedChange:
                clientSpeedChange,

            acceleration:
                clientAcceleration,

            bearing:
                currentBearing
        }
    );
}


/* =========================================================
   START TRACKING
   ========================================================= */

async function startTracking() {

    if (tracking) {

        setStatus(
            "⚠️ Tracking is already active.",
            "warning"
        );

        return;
    }


    if (
        !navigator.geolocation
    ) {

        setStatus(
            "❌ Geolocation is not supported by this browser.",
            "error"
        );

        return;
    }


    try {

        /*
           Reset browser state.
        */

        firstPosition =
            null;

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

        emergencyAlertActive =
            false;


        /*
           Hide old alert.
        */

        hideEmergencyAlert();


        /*
           Reset server state.
        */

        try {

            await postJSON(
                "/reset",
                {
                    user_id:
                        userId
                }
            );

        } catch (resetError) {

            console.warn(
                "Reset endpoint warning:",
                resetError
            );
        }


        tracking =
            true;


        setStatus(
            "📍 Requesting GPS location...",
            "normal"
        );


        /*
           Start GPS watch.
        */

        watchId =
            navigator.geolocation.watchPosition(

                handleGPSPosition,

                handleGPSError,

                {

                    enableHighAccuracy:
                        true,

                    maximumAge:
                        0,

                    timeout:
                        10000
                }
            );


        const startButton =
            getElement(
                "startTracking",
                "startButton"
            );

        const stopButton =
            getElement(
                "stopTracking",
                "stopButton"
            );

        if (startButton) {

            startButton.disabled =
                true;
        }

        if (stopButton) {

            stopButton.disabled =
                false;
        }


    } catch (error) {

        console.error(
            "Start tracking error:",
            error
        );

        tracking =
            false;

        setStatus(
            `❌ Could not start tracking: ${error.message}`,
            "error"
        );
    }
}


/* =========================================================
   STOP TRACKING
   ========================================================= */

function stopTracking() {

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

    const startButton =
        getElement(
            "startTracking",
            "startButton"
        );

    const stopButton =
        getElement(
            "stopTracking",
            "stopButton"
        );

    if (startButton) {

        startButton.disabled =
            false;
    }

    if (stopButton) {

        stopButton.disabled =
            true;
    }

    setStatus(
        "⏹️ Tracking stopped.",
        "normal"
    );
}


/* =========================================================
   DEVICE SHAKE DETECTION
   ========================================================= */

let shakeLastTime =
    0;

let shakePermissionRequested =
    false;


function calculateShakeMagnitude(
    x,
    y,
    z
) {

    return Math.sqrt(
        x * x +
        y * y +
        z * z
    );
}


async function requestMotionPermission() {

    try {

        if (
            typeof DeviceMotionEvent !==
            "undefined" &&
            typeof DeviceMotionEvent.requestPermission ===
            "function"
        ) {

            if (
                shakePermissionRequested
            ) {

                return;
            }

            const permission =
                await DeviceMotionEvent.requestPermission();

            shakePermissionRequested =
                true;

            if (
                permission !==
                "granted"
            ) {

                console.warn(
                    "Device motion permission denied."
                );

                return false;
            }
        }

        return true;

    } catch (error) {

        console.error(
            "Motion permission error:",
            error
        );

        return false;
    }
}


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
        calculateShakeMagnitude(
            x,
            y,
            z
        );

    /*
       Shake threshold.

       Keep this easy to change later.
    */

    const SHAKE_THRESHOLD =
        18;


    const now =
        Date.now();

    if (
        magnitude <
        SHAKE_THRESHOLD
    ) {

        return;
    }


    /*
       Prevent multiple triggers
       within a short period.
    */

    if (
        now -
        shakeLastTime <
        3000
    ) {

        return;
    }

    shakeLastTime =
        now;


    console.log(
        "DEVICE SHAKE DETECTED:",
        magnitude
    );


    setStatus(
        "📱 Device shake detected!",
        "danger"
    );


    /*
       Send shake directly to backend.

       GPS is optional.
    */

    try {

        const payload = {

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
                999,

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
        };


        const response =
            await postJSON(
                "/movement",
                payload
            );


        console.log(
            "DEVICE SHAKE RESPONSE:",
            response
        );


        /*
           Show emergency alert.

           For a shake we intentionally
           show the alert immediately.
        */

        showEmergencyAlert(
            "📱 Device shake detected. Please confirm that you are safe.",
            response
        );


    } catch (error) {

        console.error(
            "Device shake request failed:",
            error
        );

        /*
           Even if backend fails,
           still show local safety alert.
        */

        showEmergencyAlert(
            "📱 Device shake detected. Please confirm that you are safe.",
            {

                risk_score:
                    50,

                emergency_risk:
                    "HIGH",

                reasons: [
                    "Device Shake detected."
                ]
            }
        );
    }
}


/* =========================================================
   ENABLE DEVICE SHAKE
   ========================================================= */

async function enableDeviceShake() {

    const allowed =
        await requestMotionPermission();

    if (!allowed) {

        setStatus(
            "⚠️ Motion permission was not granted.",
            "warning"
        );

        return;
    }


    window.addEventListener(
        "devicemotion",
        handleDeviceMotion,
        {
            passive: true
        }
    );


    console.log(
        "Device Shake detection enabled."
    );
}


/* =========================================================
   MANUAL SHAKE TEST
   ========================================================= */

async function testDeviceShake() {

    console.log(
        "Manual Device Shake test."
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
                        999,

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
            "📱 Device shake test detected.",
            response
        );


    } catch (error) {

        console.error(
            "Shake test error:",
            error
        );

        showEmergencyAlert(
            "📱 Device shake test detected.",
            {

                risk_score:
                    50,

                emergency_risk:
                    "HIGH",

                reasons: [
                    "Device Shake test."
                ]
            }
        );
    }
}


/* =========================================================
   MANUAL EMERGENCY BUTTON
   ========================================================= */

function attachEmergencyButton() {

    const button =
        getElement(
            "reportEmergency",
            "emergencyButton",
            "sosButton",
            "needHelpButton"
        );

    if (!button) {

        console.log(
            "No manual emergency button found."
        );

        return;
    }

    button.addEventListener(
        "click",
        reportEmergency
    );
}


/* =========================================================
   START / STOP BUTTONS
   ========================================================= */

function attachTrackingButtons() {

    const startButton =
        getElement(
            "startTracking",
            "startButton"
        );

    const stopButton =
        getElement(
            "stopTracking",
            "stopButton"
        );


    if (startButton) {

        startButton.addEventListener(
            "click",
            startTracking
        );
    }


    if (stopButton) {

        stopButton.addEventListener(
            "click",
            stopTracking
        );

        stopButton.disabled =
            true;
    }
}


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

window.showEmergencyAlert =
    showEmergencyAlert;

window.hideEmergencyAlert =
    hideEmergencyAlert;

window.testDeviceShake =
    testDeviceShake;

window.enableDeviceShake =
    enableDeviceShake;


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        console.log(
            "SafeRoute AI JS initialized."
        );

        refreshEmergencyElements();

        attachTrackingButtons();

        attachEmergencyButton();


        /*
           Create emergency UI early,
           but keep it hidden.
        */

        createEmergencyUI();

        hideEmergencyAlert();


        /*
           Enable Device Motion.

           On iOS this may require a user
           interaction before permission.
        */

        const motionButton =
            getElement(
                "enableShake",
                "enableMotion",
                "shakeButton"
            );

        if (motionButton) {

            motionButton.addEventListener(
                "click",
                enableDeviceShake
            );

        } else {

            /*
               For browsers that do not require
               explicit permission.
            */

            try {

                await enableDeviceShake();

            } catch (error) {

                console.warn(
                    "Automatic motion setup failed:",
                    error
                );
            }
        }


        console.log(
            "SafeRoute AI ready."
        );
    }
);