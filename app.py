import math
import time
import os
from collections import deque

from flask import Flask, render_template, request, jsonify
from twilio.rest import Client


app = Flask(__name__)


# ============================================================
# CONFIGURATION
# ============================================================

PORT = int(os.getenv("PORT", "8080"))

# Movement testing threshold
MIN_MOVEMENT_METERS = 0.0

# GPS quality
MAX_GPS_ACCURACY = 50.0
GOOD_GPS_ACCURACY = 30.0

# Direction
MIN_DIRECTION_DISTANCE_METERS = 0.5
MIN_DIRECTION_SPEED = 1.0

# Speed
MAX_REASONABLE_SPEED_KMH = 220.0

# Smoothing
SPEED_HISTORY_SIZE = 5

# Safety confirmation
SUDDEN_CONFIRMATIONS_REQUIRED = 2
ALERT_COOLDOWN_SECONDS = 20.0

# Sudden GPS movement
SUDDEN_DISTANCE_METERS = 3.0
SUDDEN_DISTANCE_MAX_SECONDS = 4.0

# Speed change
MEDIUM_SPEED_CHANGE = 3.0
LARGE_SPEED_CHANGE = 6.0

# Acceleration
MEDIUM_ACCELERATION = 0.8
LARGE_ACCELERATION = 1.8

# Direction change
MEDIUM_DIRECTION_CHANGE = 20.0
LARGE_DIRECTION_CHANGE = 35.0


# ============================================================
# TWILIO CONFIGURATION
# ============================================================

TWILIO_ACCOUNT_SID = os.getenv(
    "TWILIO_ACCOUNT_SID",
    ""
).strip()

TWILIO_AUTH_TOKEN = os.getenv(
    "TWILIO_AUTH_TOKEN",
    ""
).strip()

TWILIO_FROM_NUMBER = os.getenv(
    "TWILIO_FROM_NUMBER",
    os.getenv("TWILIO_PHONE_NUMBER", "")
).strip()

FRIEND_PHONE_NUMBER = os.getenv(
    "FRIEND_PHONE_NUMBER",
    os.getenv("EMERGENCY_CONTACT_NUMBER", "")
).strip()


twilio_client = None


if (
    TWILIO_ACCOUNT_SID
    and TWILIO_AUTH_TOKEN
    and TWILIO_FROM_NUMBER
    and FRIEND_PHONE_NUMBER
):

    try:

        twilio_client = Client(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN
        )

        print("Twilio SMS: configured")

    except Exception as error:

        print(
            "Twilio initialization failed:",
            error
        )

else:

    print(
        "Twilio SMS: not configured."
    )


print(
    "Twilio SID loaded:",
    bool(TWILIO_ACCOUNT_SID)
)

print(
    "Twilio Auth Token loaded:",
    bool(TWILIO_AUTH_TOKEN)
)

print(
    "Twilio phone number loaded:",
    bool(TWILIO_FROM_NUMBER)
)

print(
    "Emergency contact loaded:",
    bool(FRIEND_PHONE_NUMBER)
)


# ============================================================
# USER STATE
# ============================================================

user_states = {}


def new_state():

    return {

        "last_lat": None,
        "last_lon": None,
        "last_timestamp": None,

        "last_speed": 0.0,
        "smoothed_speed": 0.0,

        "last_bearing": None,

        "speed_history":
            deque(
                maxlen=SPEED_HISTORY_SIZE
            ),

        "suspicious_streak": 0,

        "last_alert_time": 0.0,

        "last_update":
            time.time(),

        "total_distance": 0.0
    }


def get_state(user_id):

    if user_id not in user_states:

        user_states[user_id] = \
            new_state()

    return user_states[user_id]


# ============================================================
# HAVERSINE DISTANCE
# ============================================================

def haversine_distance(
    lat1,
    lon1,
    lat2,
    lon2
):

    earth_radius = 6371000.0

    p1 = math.radians(lat1)
    p2 = math.radians(lat2)

    dp = math.radians(
        lat2 - lat1
    )

    dl = math.radians(
        lon2 - lon1
    )

    a = (
        math.sin(dp / 2) ** 2
        +
        math.cos(p1)
        *
        math.cos(p2)
        *
        math.sin(dl / 2) ** 2
    )

    a = min(
        1.0,
        max(0.0, a)
    )

    return (
        earth_radius
        *
        2
        *
        math.atan2(
            math.sqrt(a),
            math.sqrt(1 - a)
        )
    )


# ============================================================
# BEARING
# ============================================================

def calculate_bearing(
    lat1,
    lon1,
    lat2,
    lon2
):

    p1 = math.radians(lat1)
    p2 = math.radians(lat2)

    dl = math.radians(
        lon2 - lon1
    )

    x = (
        math.sin(dl)
        *
        math.cos(p2)
    )

    y = (
        math.cos(p1)
        *
        math.sin(p2)
        -
        math.sin(p1)
        *
        math.cos(p2)
        *
        math.cos(dl)
    )

    bearing = math.degrees(
        math.atan2(x, y)
    )

    return (
        bearing + 360.0
    ) % 360.0


# ============================================================
# ANGLE DIFFERENCE
# ============================================================

def angle_difference(
    a,
    b
):

    difference = (
        abs(a - b)
        % 360.0
    )

    return min(
        difference,
        360.0 - difference
    )


# ============================================================
# SPEED
# ============================================================

def speed_from_distance(
    distance_m,
    seconds
):

    if seconds <= 0:

        return 0.0

    return (
        distance_m
        /
        seconds
    ) * 3.6


# ============================================================
# SPEED SMOOTHING
# ============================================================

def smooth_speed(values):

    if not values:

        return 0.0

    values = sorted(values)

    n = len(values)

    if n % 2:

        median = \
            values[n // 2]

    else:

        median = (
            values[n // 2 - 1]
            +
            values[n // 2]
        ) / 2

    average = (
        sum(values)
        /
        len(values)
    )

    return (
        median * 0.6
        +
        average * 0.4
    )


# ============================================================
# TWILIO SMS
# ============================================================

def send_emergency_sms(
    latitude,
    longitude,
    reason
):

    print("")
    print(
        "========== EMERGENCY SMS =========="
    )

    print(
        "Latitude:",
        latitude
    )

    print(
        "Longitude:",
        longitude
    )

    print(
        "Reason:",
        reason
    )

    if twilio_client is None:

        print(
            "Twilio SMS FAILED: "
            "Twilio is not configured."
        )

        print(
            "===================================="
        )

        return False

    try:

        if (
            latitude is not None
            and
            longitude is not None
        ):

            maps_link = (
                "https://www.google.com/maps?q="
                f"{latitude},{longitude}"
            )

            location_text = maps_link

        else:

            location_text = (
                "GPS location unavailable."
            )

        message_body = (
            "SAFEROUTE EMERGENCY ALERT\n\n"

            "Emergency reported by "
            "the user.\n"

            f"Reason: {reason}\n\n"

            "Current location:\n"

            f"{location_text}\n\n"

            "Please check immediately."
        )

        print(
            "Sending SMS to:",
            FRIEND_PHONE_NUMBER
        )

        message = (
            twilio_client.messages.create(
                body=message_body,

                from_=TWILIO_FROM_NUMBER,

                to=FRIEND_PHONE_NUMBER
            )
        )

        print(
            "Emergency SMS sent successfully."
        )

        print(
            "Message SID:",
            message.sid
        )

        print(
            "===================================="
        )

        return True

    except Exception as error:

        print(
            "Emergency SMS FAILED:"
        )

        print(
            type(error).__name__
        )

        print(
            str(error)
        )

        print(
            "===================================="
        )

        return False


# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():

    return render_template(
        "index.html"
    )


# ============================================================
# RESET
# ============================================================

@app.post("/reset")
def reset():

    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    user_id = str(
        data.get(
            "user_id",
            "default_user"
        )
    )

    user_states.pop(
        user_id,
        None
    )

    print(
        "Tracking state reset:",
        user_id
    )

    return jsonify({

        "success": True,

        "message":
            "Tracking reset successfully."
    })


# ============================================================
# MOVEMENT
# ============================================================

@app.post("/movement")
def movement():

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        user_id = str(
            data.get(
                "user_id",
                "default_user"
            )
        )

        source = str(
            data.get(
                "source",
                "GPS"
            )
        )

        gps_available = bool(
            data.get(
                "gps_available",
                True
            )
        )

        latitude = data.get(
            "latitude"
        )

        longitude = data.get(
            "longitude"
        )

        accuracy = data.get(
            "accuracy"
        )

        timestamp = data.get(
            "timestamp"
        )

        distance = float(
            data.get(
                "distance",
                0
            )
            or 0
        )

        speed = data.get(
            "speed"
        )

        previous_speed = data.get(
            "previous_speed",
            0
        )

        speed_change = float(
            data.get(
                "speed_change",
                0
            )
            or 0
        )

        acceleration = float(
            data.get(
                "acceleration",
                0
            )
            or 0
        )

        direction = data.get(
            "direction"
        )

        previous_speed = float(
            previous_speed or 0
        )

        if accuracy is None:

            accuracy = 999.0

        else:

            accuracy = float(
                accuracy
            )

        if source == "Device Shake":

            # Device shake is a testing
            # signal. It does not require GPS.

            risk_score = 10

            if distance >= 3:

                risk_score = 30

            if distance >= 5:

                risk_score = 40

            if distance >= 10:

                risk_score = 50

            if distance >= 20:

                risk_score = 70

            if risk_score >= 50:

                risk_level = "HIGH"

                action = \
                    "REPORT_EMERGENCY"

            elif risk_score >= 30:

                risk_level = "MEDIUM"

                action = \
                    "CONFIRM_SAFE"

            else:

                risk_level = "LOW"

                action = \
                    "CONFIRM_SAFE"

            result = {

                "success": True,

                "source":
                    "Device Shake",

                "gps_available":
                    gps_available,

                "latitude":
                    latitude,

                "longitude":
                    longitude,

                "accuracy":
                    accuracy,

                "timestamp":
                    timestamp,

                "distance_meters":
                    round(
                        distance,
                        2
                    ),

                "speed":
                    speed,

                "previous_speed":
                    previous_speed,

                "speed_change":
                    speed_change,

                "acceleration":
                    acceleration,

                "direction":
                    direction,

                "risk_score":
                    risk_score,

                "risk_level":
                    risk_level,

                "emergency_risk":
                    risk_level,

                "recommended_action":
                    action,

                "sudden_movement":
                    True,

                "sms_sent":
                    False,

                "reasons": [
                    "Device Shake detected."
                ],

                "message":
                    "Device Shake detected."
            }

            print(
                "========== MOVEMENT EVENT =========="
            )

            print(
                "Source:",
                source
            )

            print(
                "GPS Available:",
                gps_available
            )

            print(
                "Latitude:",
                latitude
            )

            print(
                "Longitude:",
                longitude
            )

            print(
                "Accuracy:",
                accuracy
            )

            print(
                "Timestamp:",
                timestamp
            )

            print(
                "Distance:",
                distance
            )

            print(
                "Speed:",
                speed
            )

            print(
                "Previous Speed:",
                previous_speed
            )

            print(
                "Speed Change:",
                speed_change
            )

            print(
                "Acceleration:",
                acceleration
            )

            print(
                "Direction:",
                direction
            )

            print(
                "Risk Score:",
                risk_score
            )

            print(
                "Risk Level:",
                risk_level
            )

            print(
                "Recommended Action:",
                action
            )

            print(
                "===================================="
            )

            return jsonify(
                result
            )

        # ====================================================
        # GPS VALIDATION
        # ====================================================

        if latitude is None or \
           longitude is None:

            return jsonify({

                "success": False,

                "error":
                    "GPS coordinates are required "
                    "for GPS movement events."
            }), 400

        latitude = float(
            latitude
        )

        longitude = float(
            longitude
        )

        if not (
            -90 <= latitude <= 90
            and
            -180 <= longitude <= 180
        ):

            return jsonify({

                "success": False,

                "error":
                    "Invalid GPS coordinates."
            }), 400

        # ====================================================
        # STATE
        # ====================================================

        state = get_state(
            user_id
        )

        now = time.time()

        if timestamp is None:

            timestamp = now

        timestamp = float(
            timestamp
        )

        # Browser timestamps are
        # normally milliseconds.

        if timestamp > 10000000000:

            timestamp /= 1000.0

        # ====================================================
        # FIRST GPS POSITION
        # ====================================================

        if state["last_lat"] is None:

            state["last_lat"] = \
                latitude

            state["last_lon"] = \
                longitude

            state["last_timestamp"] = \
                timestamp

            state["last_update"] = \
                now

            print(
                "First GPS position stored."
            )

            return jsonify({

                "success": True,

                "latitude":
                    latitude,

                "longitude":
                    longitude,

                "accuracy":
                    accuracy,

                "distance_meters":
                    0,

                "total_distance_meters":
                    0,

                "speed":
                    0,

                "previous_speed":
                    0,

                "speed_change":
                    0,

                "acceleration":
                    0,

                "direction":
                    None,

                "direction_change":
                    0,

                "risk_score":
                    0,

                "risk_level":
                    "LOW",

                "emergency_risk":
                    "LOW",

                "sudden_movement":
                    False,

                "sms_sent":
                    False,

                "reasons":
                    [],

                "message":
                    "GPS tracking active. "
                    "Waiting for movement."
            })

        # ====================================================
        # TIME
        # ====================================================

        dt = (
            timestamp
            -
            float(
                state["last_timestamp"]
            )
        )

        if dt <= 0:

            dt = (
                now
                -
                float(
                    state["last_update"]
                )
            )

        dt = max(
            0.25,
            min(dt, 30.0)
        )

        # ====================================================
        # DISTANCE
        # ====================================================

        distance = (
            haversine_distance(
                state["last_lat"],
                state["last_lon"],
                latitude,
                longitude
            )
        )

        movement_detected = (
            distance >
            MIN_MOVEMENT_METERS
        )

        # ====================================================
        # SPEED
        # ====================================================

        raw_speed = (
            speed_from_distance(
                distance,
                dt
            )
        )

        if raw_speed <= \
           MAX_REASONABLE_SPEED_KMH:

            filtered_speed = \
                raw_speed

        else:

            filtered_speed = 0.0

        state[
            "speed_history"
        ].append(
            filtered_speed
        )

        smoothed_speed = \
            smooth_speed(
                state[
                    "speed_history"
                ]
            )

        previous_speed = \
            state[
                "smoothed_speed"
            ]

        calculated_speed_change = (
            smoothed_speed
            -
            previous_speed
        )

        calculated_acceleration = (
            calculated_speed_change
            /
            dt
        )

        # ====================================================
        # DIRECTION
        # ====================================================

        bearing = None

        direction_change = 0.0

        if (
            distance
            >=
            MIN_DIRECTION_DISTANCE_METERS
        ):

            bearing = \
                calculate_bearing(
                    state["last_lat"],
                    state["last_lon"],
                    latitude,
                    longitude
                )

            if (
                state["last_bearing"]
                is not None
                and
                previous_speed
                >= MIN_DIRECTION_SPEED
            ):

                direction_change = \
                    angle_difference(
                        state[
                            "last_bearing"
                        ],
                        bearing
                    )

        # ====================================================
        # SUDDEN MOVEMENT
        # ====================================================

        sudden_position_jump = (

            accuracy
            <= MAX_GPS_ACCURACY

            and

            distance
            >= SUDDEN_DISTANCE_METERS

            and

            dt
            <= SUDDEN_DISTANCE_MAX_SECONDS

            and

            raw_speed
            <= MAX_REASONABLE_SPEED_KMH
        )

        # ====================================================
        # ALERTS
        # ====================================================

        speed_alert = (
            calculated_speed_change
            >= LARGE_SPEED_CHANGE
        )

        deceleration_alert = (
            calculated_speed_change
            <= -LARGE_SPEED_CHANGE
        )

        direction_alert = (
            direction_change
            >= LARGE_DIRECTION_CHANGE
            and
            smoothed_speed
            >= MIN_DIRECTION_SPEED
        )

        # ====================================================
        # REASONS
        # ====================================================

        reasons = []

        if speed_alert:

            reasons.append(
                "Sudden increase in speed detected."
            )

        if deceleration_alert:

            reasons.append(
                "Sudden decrease in speed detected."
            )

        if abs(
            calculated_acceleration
        ) >= LARGE_ACCELERATION:

            reasons.append(
                "High acceleration/deceleration detected."
            )

        if direction_alert:

            reasons.append(
                "Sharp direction change detected."
            )

        if sudden_position_jump:

            reasons.append(
                "Sudden GPS position change detected."
            )

        # ====================================================
        # RISK SCORE
        # ====================================================

        risk_score = 0

        if abs(
            calculated_speed_change
        ) >= MEDIUM_SPEED_CHANGE:

            risk_score += 25

        if abs(
            calculated_speed_change
        ) >= LARGE_SPEED_CHANGE:

            risk_score += 20

        if abs(
            calculated_acceleration
        ) >= MEDIUM_ACCELERATION:

            risk_score += 20

        if abs(
            calculated_acceleration
        ) >= LARGE_ACCELERATION:

            risk_score += 20

        if direction_change >= \
           MEDIUM_DIRECTION_CHANGE:

            risk_score += 15

        if direction_change >= \
           LARGE_DIRECTION_CHANGE:

            risk_score += 15

        if sudden_position_jump:

            risk_score += 30

        risk_score = int(
            max(
                0,
                min(
                    risk_score,
                    100
                )
            )
        )

        # ====================================================
        # RISK LEVEL
        # ====================================================

        if risk_score >= 50:

            risk_level = "HIGH"

            action = \
                "REPORT_EMERGENCY"

            message = (
                "🚨 High-risk movement detected."
            )

        elif risk_score >= 30:

            risk_level = "MEDIUM"

            action = \
                "CONFIRM_SAFE"

            message = (
                "⚠️ Unusual movement detected."
            )

        else:

            risk_level = "LOW"

            action = \
                "CONFIRM_SAFE"

            message = (
                "✓ Movement appears normal."
            )

        # ====================================================
        # UPDATE STATE
        # ====================================================

        state[
            "last_lat"
        ] = latitude

        state[
            "last_lon"
        ] = longitude

        state[
            "last_timestamp"
        ] = timestamp

        state[
            "last_speed"
        ] = filtered_speed

        state[
            "smoothed_speed"
        ] = smoothed_speed

        if bearing is not None:

            state[
                "last_bearing"
            ] = bearing

        state[
            "last_update"
        ] = now

        state[
            "total_distance"
        ] += distance

        # ====================================================
        # RESPONSE
        # ====================================================

        result = {

            "success": True,

            "latitude":
                latitude,

            "longitude":
                longitude,

            "accuracy":
                accuracy,

            "distance_meters":
                round(
                    distance,
                    2
                ),

            "total_distance_meters":
                round(
                    state[
                        "total_distance"
                    ],
                    2
                ),

            "time_seconds":
                round(
                    dt,
                    2
                ),

            "speed":
                round(
                    smoothed_speed,
                    2
                ),

            "raw_speed":
                round(
                    raw_speed,
                    2
                ),

            "previous_speed":
                round(
                    previous_speed,
                    2
                ),

            "speed_change":
                round(
                    calculated_speed_change,
                    2
                ),

            "acceleration":
                round(
                    calculated_acceleration,
                    2
                ),

            "direction":
                (
                    round(
                        bearing,
                        1
                    )
                    if bearing is not None
                    else None
                ),

            "direction_change":
                round(
                    direction_change,
                    1
                ),

            "risk_score":
                risk_score,

            "risk_level":
                risk_level,

            "emergency_risk":
                risk_level,

            "recommended_action":
                action,

            "sudden_movement":
                movement_detected,

            "sudden_position_jump":
                sudden_position_jump,

            "speed_alert":
                speed_alert,

            "deceleration_alert":
                deceleration_alert,

            "direction_alert":
                direction_alert,

            "sms_sent":
                False,

            "reasons":
                reasons,

            "message":
                message
        }

        print(
            "========== MOVEMENT EVENT =========="
        )

        print(
            "Source:",
            source
        )

        print(
            "GPS Available:",
            gps_available
        )

        print(
            "Latitude:",
            latitude
        )

        print(
            "Longitude:",
            longitude
        )

        print(
            "Accuracy:",
            accuracy
        )

        print(
            "Timestamp:",
            timestamp
        )

        print(
            "Distance:",
            distance
        )

        print(
            "Speed:",
            speed
        )

        print(
            "Previous Speed:",
            previous_speed
        )

        print(
            "Speed Change:",
            calculated_speed_change
        )

        print(
            "Acceleration:",
            calculated_acceleration
        )

        print(
            "Direction:",
            bearing
        )

        print(
            "Risk Score:",
            risk_score
        )

        print(
            "Risk Level:",
            risk_level
        )

        print(
            "Recommended Action:",
            action
        )

        print(
            "===================================="
        )

        return jsonify(
            result
        )

    except Exception as error:

        print(
            "Movement processing error:",
            error
        )

        return jsonify({

            "success": False,

            "error":
                str(error)
        }), 500


# ============================================================
# CONFIRM SAFE
# ============================================================

@app.post("/confirm-safe")
def confirm_safe():

    data = (
        request.get_json(
            silent=True
        )
        or {}
    )

    user_id = str(
        data.get(
            "user_id",
            "default_user"
        )
    )

    state = get_state(
        user_id
    )

    state[
        "suspicious_streak"
    ] = 0

    print(
        "User confirmed safe:",
        user_id
    )

    return jsonify({

        "success": True,

        "message":
            "Safety confirmed. "
            "Monitoring continues."
    })


# ============================================================
# REPORT EMERGENCY
# ============================================================

@app.post("/report-emergency")
def report_emergency():

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        user_id = str(
            data.get(
                "user_id",
                "default_user"
            )
        )

        latitude = data.get(
            "latitude"
        )

        longitude = data.get(
            "longitude"
        )

        reason = str(
            data.get(
                "reason",
                "User manually reported an emergency."
            )
        )

        # GPS is OPTIONAL.

        if latitude is not None:

            latitude = float(
                latitude
            )

            if not (
                -90 <= latitude <= 90
            ):

                latitude = None

        if longitude is not None:

            longitude = float(
                longitude
            )

            if not (
                -180 <= longitude <= 180
            ):

                longitude = None

        print("")
        print(
            "========== EMERGENCY REPORT =========="
        )

        print(
            "User ID:",
            user_id
        )

        print(
            "Latitude:",
            latitude
        )

        print(
            "Longitude:",
            longitude
        )

        print(
            "Reason:",
            reason
        )

        print(
            "======================================="
        )

        sms_sent = \
            send_emergency_sms(
                latitude,
                longitude,
                reason
            )

        if sms_sent:

            message = (
                "Emergency SMS sent successfully."
            )

        else:

            message = (
                "Emergency request received, "
                "but SMS could not be sent. "
                "Check Render/Twilio logs."
            )

        return jsonify({

            "success": True,

            "sms_sent":
                sms_sent,

            "message":
                message,

            "latitude":
                latitude,

            "longitude":
                longitude
        })

    except Exception as error:

        print(
            "Emergency reporting error:",
            error
        )

        return jsonify({

            "success": False,

            "sms_sent":
                False,

            "error":
                str(error)
        }), 500


# ============================================================
# TEST SMS
# ============================================================

@app.get("/test-sms")
def test_sms():

    sms_sent = \
        send_emergency_sms(
            None,
            None,
            "Test emergency notification."
        )

    return jsonify({

        "success":
            sms_sent,

        "sms_sent":
            sms_sent,

        "message":
            (
                "Test SMS sent successfully."
                if sms_sent
                else
                "Test SMS failed. "
                "Check Render logs."
            )
    })


# ============================================================
# SERVER
# ============================================================

if __name__ == "__main__":

    print("")
    print(
        "=========================================="
    )
    print(
        "SafeRoute AI - Movement & Safety Monitor"
    )
    print(
        "=========================================="
    )

    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=True
    )