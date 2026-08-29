from flask import Flask, render_template, request, jsonify
from datetime import datetime
import os

from dotenv import load_dotenv
from twilio.rest import Client


# ==========================================
# LOAD ENVIRONMENT VARIABLES
# ==========================================

load_dotenv()


# ==========================================
# FLASK APP
# ==========================================

app = Flask(__name__)


# ==========================================
# TWILIO CONFIGURATION
# ==========================================

TWILIO_ACCOUNT_SID = os.getenv(
    "TWILIO_ACCOUNT_SID"
)

TWILIO_AUTH_TOKEN = os.getenv(
    "TWILIO_AUTH_TOKEN"
)

TWILIO_PHONE_NUMBER = os.getenv(
    "TWILIO_PHONE_NUMBER"
)

EMERGENCY_CONTACT_NUMBER = os.getenv(
    "EMERGENCY_CONTACT_NUMBER"
)


# ==========================================
# TWILIO CLIENT
# ==========================================

twilio_client = None


if (
    TWILIO_ACCOUNT_SID
    and
    TWILIO_AUTH_TOKEN
):

    twilio_client = Client(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN
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
    bool(TWILIO_PHONE_NUMBER)
)

print(
    "Emergency contact loaded:",
    bool(EMERGENCY_CONTACT_NUMBER)
)


# ==========================================
# HOME
# ==========================================

@app.route("/")
def home():

    return render_template(
        "index.html"
    )


# ==========================================
# MOVEMENT API
# ==========================================

@app.route(
    "/movement",
    methods=["POST"]
)
def movement():

    try:

        data = request.get_json()


        if not data:

            return jsonify({

                "success": False,

                "message":
                    "No movement data received."

            }), 400


        # ==================================
        # GPS DATA
        # ==================================

        latitude = data.get(
            "latitude"
        )

        longitude = data.get(
            "longitude"
        )

        accuracy = data.get(
            "accuracy"
        )

        altitude = data.get(
            "altitude"
        )

        timestamp = data.get(
            "timestamp"
        )


        # ==================================
        # MOVEMENT DATA
        # ==================================

        distance = data.get(
            "distance",
            0
        )

        speed = data.get(
            "speed"
        )

        previous_speed = data.get(
            "previous_speed"
        )

        speed_change = data.get(
            "speed_change",
            0
        )

        acceleration = data.get(
            "acceleration",
            0
        )

        direction = data.get(
            "direction"
        )

        source = data.get(
            "source",
            "Unknown"
        )


        # ==================================
        # GPS STATUS
        # ==================================

        gps_available = (

            latitude is not None

            and

            longitude is not None

        )


        # ==================================
        # SAFE DEFAULT VALUES
        # ==================================

        if distance is None:
            distance = 0

        if speed_change is None:
            speed_change = 0

        if acceleration is None:
            acceleration = 0


        # ==================================
        # SAFETY SCORE
        # ==================================

        risk_score = 0


        # GPS accuracy

        if accuracy is not None:

            if accuracy > 100:

                risk_score += 10

            elif accuracy > 50:

                risk_score += 5


        # Speed

        if speed is not None:

            if speed > 8:

                risk_score += 20

            elif speed > 4:

                risk_score += 10


        # Acceleration

        if acceleration is not None:

            if acceleration > 5:

                risk_score += 20

            elif acceleration > 2:

                risk_score += 10


        # Distance

        if distance is not None:

            if distance > 10:

                risk_score += 20

            elif distance > 1:

                risk_score += 10


        # Device shake

        if source == "Device Shake":

            risk_score += 10


        # ==================================
        # SAFETY DECISION
        # ==================================

        if risk_score >= 40:

            risk_level = "HIGH"

            action = "REPORT_EMERGENCY"


        elif risk_score >= 20:

            risk_level = "MEDIUM"

            action = "CONFIRM_SAFE"


        else:

            risk_level = "LOW"

            action = "CONFIRM_SAFE"


        # ==================================
        # SERVER LOG
        # ==================================

        print()

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
            "Altitude:",
            altitude
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

        print()


        # ==================================
        # RESPONSE
        # ==================================

        return jsonify({

            "success": True,

            "movement_detected": True,

            "source": source,

            "gps_available":
                gps_available,

            "latitude":
                latitude,

            "longitude":
                longitude,

            "distance":
                distance,

            "risk_score":
                risk_score,

            "risk_level":
                risk_level,

            "action":
                action,

            "message":
                "Movement received and analyzed successfully."

        }), 200


    except Exception as e:

        print(
            "Movement API Error:",
            e
        )


        return jsonify({

            "success": False,

            "message":
                "Server error while processing movement.",

            "error":
                str(e)

        }), 500


# ==========================================
# EMERGENCY API
# ==========================================

@app.route(
    "/api/emergency",
    methods=["POST"]
)
def emergency_alert():

    try:

        # ==================================
        # CHECK TWILIO
        # ==================================

        if twilio_client is None:

            return jsonify({

                "success": False,

                "message":
                    "Twilio is not configured."

            }), 500


        if not TWILIO_PHONE_NUMBER:

            return jsonify({

                "success": False,

                "message":
                    "Twilio phone number is missing."

            }), 500


        if not EMERGENCY_CONTACT_NUMBER:

            return jsonify({

                "success": False,

                "message":
                    "Emergency contact number is missing."

            }), 400


        # ==================================
        # GET MOVEMENT DATA
        # ==================================

        data = request.get_json(
            silent=True
        ) or {}


        latitude = data.get(
            "latitude"
        )

        longitude = data.get(
            "longitude"
        )

        accuracy = data.get(
            "accuracy"
        )

        source = data.get(
            "source",
            "Emergency Button"
        )

        distance = data.get(
            "distance"
        )


        # ==================================
        # CURRENT TIME
        # ==================================

        current_time = (
            datetime.now()
            .strftime(
                "%d %B %Y, %I:%M:%S %p"
            )
        )


        # ==================================
        # LOCATION TEXT
        # ==================================

        if (
            latitude is not None
            and
            longitude is not None
        ):

            location_text = (
                f"Latitude: {latitude}\n"
                f"Longitude: {longitude}"
            )

        else:

            location_text = (
                "Location currently unavailable."
            )


        # ==================================
        # SMS MESSAGE
        # ==================================

        message = (

            "SAFE ROUTE AI - EMERGENCY ALERT\n\n"

            "The user has reported an emergency.\n\n"

            f"Time: {current_time}\n\n"

            f"Trigger: {source}\n\n"

            f"{location_text}\n\n"

            f"GPS Accuracy: {accuracy}\n\n"

            f"Movement: {distance}\n\n"

            "Please check on the user immediately."
        )


        # ==================================
        # SEND SMS
        # ==================================

        sms = twilio_client.messages.create(

            body=message,

            from_=TWILIO_PHONE_NUMBER,

            to=EMERGENCY_CONTACT_NUMBER

        )


        print()

        print(
            "========== EMERGENCY SMS =========="
        )

        print(
            "SMS sent successfully."
        )

        print(
            "Message SID:",
            sms.sid
        )

        print(
            "To:",
            EMERGENCY_CONTACT_NUMBER
        )

        print(
            "==================================="
        )

        print()


        return jsonify({

            "success": True,

            "message":
                "Emergency alert sent successfully.",

            "sid":
                sms.sid

        }), 200


    except Exception as e:

        print(
            "Emergency SMS Error:",
            e
        )


        return jsonify({

            "success": False,

            "message":
                "Emergency SMS could not be sent.",

            "error":
                str(e)

        }), 500


# ==========================================
# RUN APPLICATION
# ==========================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )