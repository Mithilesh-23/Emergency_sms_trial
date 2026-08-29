from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

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


        # ==========================================
        # GPS AVAILABILITY
        # ==========================================

        gps_available = (
            latitude is not None
            and
            longitude is not None
        )


        # ==========================================
        # BASIC VALUE SAFETY
        # ==========================================

        if distance is None:
            distance = 0

        if speed_change is None:
            speed_change = 0

        if acceleration is None:
            acceleration = 0


        # ==========================================
        # SAFETY ANALYSIS
        # ==========================================

        risk_score = 0


        # ------------------------------------------
        # GPS ACCURACY
        # ------------------------------------------

        if accuracy is not None:

            if accuracy > 100:
                risk_score += 10

            elif accuracy > 50:
                risk_score += 5


        # ------------------------------------------
        # SPEED
        # ------------------------------------------

        if speed is not None:

            if speed > 8:
                risk_score += 20

            elif speed > 4:
                risk_score += 10


        # ------------------------------------------
        # ACCELERATION
        # ------------------------------------------

        if acceleration is not None:

            if acceleration > 5:
                risk_score += 20

            elif acceleration > 2:
                risk_score += 10


        # ------------------------------------------
        # MOVEMENT DISTANCE
        # ------------------------------------------

        if distance is not None:

            if distance > 10:
                risk_score += 20

            elif distance > 1:
                risk_score += 10


        # ==========================================
        # DEVICE SHAKE ANALYSIS
        # ==========================================

        if source == "Device Shake":

            # A detected device shake itself
            # contributes to the safety event.

            risk_score += 10


        # ==========================================
        # GPS UNAVAILABLE
        # ==========================================

        if not gps_available:

            print(
                "GPS currently unavailable."
            )

            # Do not reject the movement event.
            # Device shake can work independently.


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

        print()
        print("========== MOVEMENT EVENT ==========")

        print("Source:", source)

        print("GPS Available:", gps_available)

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

        print("Recommended Action:", action)

        print("====================================")
        print()


        # ==========================================
        # RESPONSE
        # ==========================================

        return jsonify({

            "success": True,

            "movement_detected": True,

            "source": source,

            "gps_available": gps_available,

            "latitude": latitude,

            "longitude": longitude,

            "distance": distance,

            "risk_score": risk_score,

            "risk_level": risk_level,

            "action": action,

            "message":
                "Movement received and analyzed successfully."
        }), 200


    # ==========================================
    # ERROR HANDLING
    # ==========================================

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
# RUN APPLICATION
# ==========================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )