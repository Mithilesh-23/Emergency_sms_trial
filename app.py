from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

app = Flask(__name__)


# ==========================================
# HOME
# ==========================================

@app.route("/")
def home():
    return render_template("index.html")


# ==========================================
# MOVEMENT API
# ==========================================

@app.route("/movement", methods=["POST"])
def movement():

    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "success": False,
                "message": "No movement data received"
            }), 400


        # ==========================================
        # GPS INFORMATION
        # ==========================================

        latitude = data.get("latitude")
        longitude = data.get("longitude")
        accuracy = data.get("accuracy")
        altitude = data.get("altitude")
        timestamp = data.get("timestamp")


        # ==========================================
        # MOVEMENT INFORMATION
        # ==========================================

        distance = data.get("distance", 0)

        speed = data.get("speed")
        previous_speed = data.get("previous_speed")

        speed_change = data.get("speed_change", 0)

        acceleration = data.get("acceleration", 0)

        direction = data.get("direction")

        movement_source = data.get(
            "source",
            "GPS Movement"
        )


        # ==========================================
        # BASIC VALIDATION
        # ==========================================

        if latitude is None or longitude is None:

            return jsonify({
                "success": False,
                "message": "Latitude and longitude are required"
            }), 400


        # ==========================================
        # SIMPLE SAFETY ANALYSIS
        # ==========================================

        risk_score = 0


        # Poor GPS accuracy
        if accuracy is not None:

            if accuracy > 100:
                risk_score += 10

            elif accuracy > 50:
                risk_score += 5


        # High speed
        if speed is not None:

            if speed > 8:
                risk_score += 20

            elif speed > 4:
                risk_score += 10


        # High acceleration
        if acceleration is not None:

            if acceleration > 5:
                risk_score += 20

            elif acceleration > 2:
                risk_score += 10


        # Large movement
        if distance is not None:

            if distance > 10:
                risk_score += 20

            elif distance > 1:
                risk_score += 10


        # ==========================================
        # RISK LEVEL
        # ==========================================

        if risk_score >= 40:

            risk_level = "HIGH"
            action = "REPORT_EMERGENCY"

        elif risk_score >= 20:

            risk_level = "MEDIUM"
            action = "CONFIRM_SAFE"

        else:

            risk_level = "LOW"
            action = "CONFIRM_SAFE"


        # ==========================================
        # SERVER LOG
        # ==========================================

        print("\n========== MOVEMENT EVENT ==========")

        print("Source:", movement_source)

        print("Latitude:", latitude)
        print("Longitude:", longitude)

        print("Accuracy:", accuracy)
        print("Altitude:", altitude)

        print("Timestamp:", timestamp)

        print("Distance:", distance)

        print("Speed:", speed)
        print("Previous Speed:", previous_speed)

        print("Speed Change:", speed_change)

        print("Acceleration:", acceleration)

        print("Direction:", direction)

        print("Risk Score:", risk_score)
        print("Risk Level:", risk_level)

        print("====================================\n")


        # ==========================================
        # RESPONSE
        # ==========================================

        return jsonify({

            "success": True,

            "movement_detected": True,

            "source": movement_source,

            "risk_score": risk_score,

            "risk_level": risk_level,

            "action": action,

            "message":
                "Movement received and analyzed successfully."
        })


    except Exception as e:

        print("Movement API Error:", e)

        return jsonify({

            "success": False,

            "message":
                "Server error while processing movement.",

            "error": str(e)

        }), 500


# ==========================================
# RUN SERVER
# ==========================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )