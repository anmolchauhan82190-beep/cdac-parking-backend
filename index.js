const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");

const app = express();
// ---------------- THINGSPEAK CONFIG ----------------
const THINGSPEAK_CHANNEL_ID = "3381652";
const THINGSPEAK_READ_API_KEY = "9GLVYTT2E05QGUUE";

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cdacParking")
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.log(err));
const sensorSchema = new mongoose.Schema({
    slot1: { type: Number, default: 0 },
    slot2: { type: Number, default: 0 },
    slot3: { type: Number, default: 0 },
    slot4: { type: Number, default: 0 },
    slot5: { type: Number, default: 0 },
    sensorHealth: { type: String, default: "11111" },
    nodeHealth: { type: String, default: "0" },
    updatedAt: { type: Date, default: Date.now }
});

const SensorStatus = mongoose.model("SensorStatus", sensorSchema);
const bookingSchema = new mongoose.Schema({
    slot: { type: Number, required: true },
    vehiclePlate: { type: String, required: true },
    vehicleType: { type: String, default: "CAR" },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    startTime: { type: String },
    endTime: { type: String },
    status: { type: String, default: "ACTIVE" },
    createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model("Booking", bookingSchema);

const adminSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },

    addedAt: {
        type: Date,
        default: Date.now
    }
});

const AdminUser = mongoose.model("AdminUser", adminSchema);

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Dummy user (for testing)
const userData = {
    email: "admin@gmail.com",
    password: "1234",
    name: "Admin User"
};

// LOGIN API
app.post("/login", (req, res) => {

    const { email, password } = req.body;

    if (!email || !email.includes("@")) {
        return res.json({
            success: false,
            message: "Enter a valid email"
        });
    }

    if (!password || password.length < 4) {
        return res.json({
            success: false,
            message: "Password must be at least 4 characters"
        });
    }

    res.json({
        success: true,
        user: {
            name: email.split("@")[0],
            email: email
        }
    });
});
// TEST ROUTE
app.get("/", (req, res) => {
    res.send("Backend is running 🚀");
});
// SENSOR UPDATE API
app.post("/api/sensors/update", async (req, res) => {

    try {

        const existing = await SensorStatus.findOne();

        if(existing) {

            existing.slot1 = req.body.slot1;
            existing.slot2 = req.body.slot2;
            existing.slot3 = req.body.slot3;
            existing.slot4 = req.body.slot4;
            existing.slot5 = req.body.slot5;
            existing.sensorHealth = req.body.sensorHealth || existing.sensorHealth || "11111";
            existing.nodeHealth = req.body.nodeHealth || existing.nodeHealth || "0";

            existing.updatedAt = Date.now();

            await existing.save();

        } else {

            await SensorStatus.create({
                slot1: req.body.slot1,
                slot2: req.body.slot2,
                slot3: req.body.slot3,
                slot4: req.body.slot4,
                slot5: req.body.slot5,
            sensorHealth: req.body.sensorHealth || "11111",
    nodeHealth: req.body.nodeHealth || "0"
            });

        }

        res.json({
            success: true,
            message: "Sensor data updated"
        });

    } catch(err) {

        console.log(err);

        res.json({
            success: false,
            message: "Error updating sensors"
        });

    }

});
// SENSOR READ API
app.get("/api/sensors/status", async (req, res) => {
    try {
        const status = await SensorStatus.findOne();

        if (!status) {
            return res.json({
                slot1: 0,
                slot2: 0,
                slot3: 0,
                slot4: 0,
                slot5: 0,
              sensorHealth: "11111",
    nodeHealth: "0"
            });
        }

        res.json(status);

    } catch (err) {
        console.log(err);
        res.json({
            success: false,
            message: "Error reading sensor status"
        });
    }
});
// THINGSPEAK SYNC API
app.get("/api/thingspeak/sync", async (req, res) => {
    try {
        if (
            THINGSPEAK_CHANNEL_ID === "YOUR_CHANNEL_ID" ||
            THINGSPEAK_READ_API_KEY === "YOUR_READ_API_KEY"
        ) {
            return res.json({
                success: false,
                message: "ThingSpeak credentials not configured yet"
            });
        }

        const url = `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?api_key=${THINGSPEAK_READ_API_KEY}&results=1`;

        const response = await axios.get(url);
        const latestFeed = response.data.feeds[0];

        const sensorData = {
            slot1: Number(latestFeed.field1) || 0,
            slot2: Number(latestFeed.field2) || 0,
            slot3: Number(latestFeed.field3) || 0,
            slot4: Number(latestFeed.field4) || 0,
            slot5: Number(latestFeed.field5) || 0,
            sensorHealth: latestFeed.field6 || "11111",
            nodeHealth: latestFeed.field7 || "0",
            updatedAt: Date.now()
        };

        const existing = await SensorStatus.findOne();

        if (existing) {
            existing.slot1 = sensorData.slot1;
            existing.slot2 = sensorData.slot2;
            existing.slot3 = sensorData.slot3;
            existing.slot4 = sensorData.slot4;
            existing.slot5 = sensorData.slot5;
            existing.sensorHealth = sensorData.sensorHealth;
            existing.nodeHealth = sensorData.nodeHealth;
            existing.updatedAt = Date.now();

            await existing.save();
        } else {
            await SensorStatus.create(sensorData);
        }

        res.json({
            success: true,
            message: "ThingSpeak data synced successfully",
            data: sensorData
        });

    } catch (err) {
        console.log(err);

        res.json({
            success: false,
            message: "Error syncing ThingSpeak data"
        });
    }
});
// CREATE BOOKING API
app.post("/api/bookings/create", async (req, res) => {
    try {
        const { slot, vehiclePlate, vehicleType, userName, userEmail, startTime, endTime } = req.body;

        // Check sensor status first
        const sensorStatus = await SensorStatus.findOne();
        const sensorValue = sensorStatus ? sensorStatus[`slot${slot}`] : 0;

        if (sensorValue == 1) {
            return res.json({
                success: false,
                message: "This slot is occupied by sensor and cannot be booked."
            });
        }

        // Check if slot is already booked
        const existingBooking = await Booking.findOne({
            slot: slot,
            status: "ACTIVE"
        });

        if (existingBooking) {
            return res.json({
                success: false,
                message: "This slot is already booked."
            });
        }

        const booking = await Booking.create({
            slot,
            vehiclePlate,
            vehicleType,
            userName,
            userEmail,
            startTime,
            endTime,
            status: "ACTIVE"
        });

        res.json({
            success: true,
            message: "Booking created successfully",
            booking
        });

    } catch (err) {
        console.log(err);
        res.json({
            success: false,
            message: "Error creating booking"
        });
    }
});
// GET ACTIVE BOOKINGS API
app.get("/api/bookings/active", async (req, res) => {
    try {
        const now = new Date();

        // Auto-complete expired bookings
        await Booking.updateMany(
            {
                status: "ACTIVE",
                endTime: { $lte: now.toISOString().slice(0, 16) }
            },
            {
                $set: { status: "COMPLETED" }
            }
        );

        // Send only currently active bookings
        const bookings = await Booking.find({ status: "ACTIVE" });

        res.json({
            success: true,
            bookings: bookings
        });

    } catch (err) {
        console.log(err);

        res.json({
            success: false,
            message: "Error fetching active bookings"
        });
    }
});
// GET BOOKING DETAILS BY SLOT
app.get("/api/bookings/slot/:slot", async (req, res) => {
    try {
        const slot = Number(req.params.slot);

        const booking = await Booking.findOne({
            slot: slot,
            status: "ACTIVE"
        });

        if (!booking) {
            return res.json({
                success: false,
                message: "No active booking found for this slot"
            });
        }

        res.json({
            success: true,
            booking: booking
        });

    } catch (err) {
        console.log(err);

        res.json({
            success: false,
            message: "Error fetching booking details"
        });
    }
});
// CANCEL USER BOOKING API
app.post("/api/bookings/cancel", async (req, res) => {
    try {
        const { slot, userEmail } = req.body;

        const booking = await Booking.findOne({
            slot: slot,
            userEmail: userEmail,
            status: "ACTIVE"
        });

        if (!booking) {
            return res.json({
                success: false,
                message: "No active booking found for this slot."
            });
        }

        booking.status = "CANCELLED";
        await booking.save();

        res.json({
            success: true,
            message: "Booking cancelled successfully"
        });

    } catch (err) {
        console.log(err);

        res.json({
            success: false,
            message: "Error cancelling booking"
        });
    }
});
// CLEAR ALL BOOKINGS API
app.post("/api/bookings/clear", async (req, res) => {
    try {

        await Booking.deleteMany({});

        res.json({
            success: true,
            message: "All bookings cleared"
        });

    } catch (err) {
        console.log(err);

        res.json({
            success: false,
            message: "Error clearing bookings"
        });
    }
});
// ---------------- SYSTEM HEALTH API ----------------
app.get("/api/system/health", async (req, res) => {
    try {
        const mongoConnected = mongoose.connection.readyState === 1;

        let thingSpeakConnected = false;
        let nodeMcuConnected = false;
        let lastUpdate = null;
        let secondsOld = null;

        try {
            const url =
                `https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds.json?api_key=${THINGSPEAK_READ_API_KEY}&results=1`;

            const tsResponse = await axios.get(url);
            const latestFeed = tsResponse.data.feeds[0];

            if (latestFeed) {
                thingSpeakConnected = true;

                lastUpdate = latestFeed.created_at;

                secondsOld = Math.floor(
                    (Date.now() - new Date(lastUpdate).getTime()) / 1000
                );

                nodeMcuConnected =
                    latestFeed.field7 === "1" && secondsOld <= 25;
            }

        } catch (thingSpeakErr) {
            thingSpeakConnected = false;
            nodeMcuConnected = false;
        }

        res.json({
            success: true,
            backend: "ONLINE",
            mongodb: mongoConnected ? "CONNECTED" : "DISCONNECTED",
            thingspeak: thingSpeakConnected ? "CONNECTED" : "DISCONNECTED",
            nodemcu: nodeMcuConnected ? "CONNECTED" : "OFFLINE",
            lastUpdate: lastUpdate,
            secondsOld: secondsOld
        });

    } catch (err) {
        res.json({
            success: false,
            backend: "ONLINE",
            mongodb: "ERROR",
            thingspeak: "ERROR",
            nodemcu: "UNKNOWN"
        });
    }
});
// ---------------- ADD NEW ADMIN ----------------
app.post("/api/admin/add", async (req, res) => {

    try {

        const { email } = req.body;

        if (!email || !email.includes("@")) {
            return res.json({
                success: false,
                message: "Invalid email"
            });
        }

        const existing =
            await AdminUser.findOne({ email });

        if (existing) {
            return res.json({
                success: false,
                message: "Already admin"
            });
        }

        const newAdmin =
            new AdminUser({ email });

        await newAdmin.save();

        res.json({
            success: true,
            message: "New admin added"
        });

    } catch (err) {

        console.log(err);

        res.json({
            success: false,
            message: "Error adding admin"
        });
    }
});

// ---------------- CHECK ADMIN ----------------
app.get("/api/admin/check/:email", async (req, res) => {
    try {
        const email = req.params.email;

        if (email === "chauhan82190@gmail.com") {
            return res.json({ success: true, isAdmin: true });
        }

        const admin = await AdminUser.findOne({ email });

        res.json({
            success: true,
            isAdmin: !!admin
        });

    } catch (err) {
        console.log(err);
        res.json({
            success: false,
            isAdmin: false
        });
    }
});


// ---------------- LIST ADMINS ----------------
app.get("/api/admin/list", async (req, res) => {
    try {
        const admins = await AdminUser.find().sort({ addedAt: -1 });

        res.json({
            success: true,
            admins: admins
        });

    } catch (err) {
        console.log(err);
        res.json({
            success: false,
            message: "Error loading admins"
        });
    }
});


// ---------------- REMOVE ADMIN ----------------
app.delete("/api/admin/remove/:id", async (req, res) => {
    try {
        const admin = await AdminUser.findById(req.params.id);

        if (!admin) {
            return res.json({
                success: false,
                message: "Admin not found"
            });
        }

        await AdminUser.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: "Admin removed successfully"
        });

    } catch (err) {
        console.log(err);
        res.json({
            success: false,
            message: "Error removing admin"
        });
    }
});
// ---------------- ADMIN GET ALL BOOKINGS ----------------
app.get("/api/bookings/all", async (req, res) => {

    try {

        const bookings =
            await Booking.find().sort({ createdAt: -1 });

        res.json({
            success: true,
            bookings: bookings
        });

    } catch (err) {

        console.log(err);

        res.json({
            success: false,
            message: "Error fetching bookings"
        });
    }
});
// ---------------- ADMIN FORCE RELEASE ----------------
app.post("/api/bookings/admin/release/:id", async (req, res) => {

    try {

        const booking =
            await Booking.findById(req.params.id);

        if (!booking) {
            return res.json({
                success: false,
                message: "Booking not found"
            });
        }

        booking.status = "CANCELLED";

        await booking.save();

        res.json({
            success: true,
            message: "Booking released successfully"
        });

    } catch (err) {

        console.log(err);

        res.json({
            success: false,
            message: "Release failed"
        });
    }
});
// AUTO SYNC THINGSPEAK EVERY 16 SECONDS
setInterval(async () => {
    try {
        await axios.get("http://localhost:5000/api/thingspeak/sync");
        console.log("ThingSpeak auto synced");
    } catch (err) {
        console.log("ThingSpeak auto sync failed");
    }
}, 5000);
// START SERVER
app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});