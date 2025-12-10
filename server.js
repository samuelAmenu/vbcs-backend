/* ==================================================
   VBCS SERVER V4.0 (Standard Onboarding Flow)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto'); // Native Node security module
const app = express();

app.use(cors());
app.use(express.json());

// ⚠️ DATABASE CONNECTION
const MONGO_URI = "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to MongoDB...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err.message));

// --- 1. ROBUST USER SCHEMA ---
const userSchema = new mongoose.Schema({
    // Primary ID
    phoneNumber: { type: String, required: true, unique: true },
    
    // Auth Data
    otp: String,
    otpExpires: Date,
    passwordHash: String, // Hashed password
    salt: String,         // Security salt
    
    // Step 5: Personal Profile
    fullName: String,
    email: String,
    dob: String,
    gender: String,
    
    // Step 6: Device Profile
    device: {
        name: String,
        type: String, // Android/iOS
        model: String,
        imei: String
    },
    
    // Status Flags
    // 1=OTP Verified, 2=Personal Done, 3=Device Done, 4=Complete
    onboardingStep: { type: Number, default: 0 }, 
    createdAt: { type: Date, default: Date.now }
});

// Helper: Password Hashing
userSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};

userSchema.methods.validatePassword = function(password) {
    if (!this.passwordHash || !this.salt) return false;
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};

const User = mongoose.model('User', userSchema);

// --- 2. API ROUTES (THE 8-STEP FLOW) ---

// Step 3: OTP Generation
app.post('/api/v4/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        let user = await User.findOne({ phoneNumber });
        if (!user) {
            user = new User({ phoneNumber }); // Step 1: Init User
        }
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000); // 5 mins
        await user.save();

        console.log(`🔐 OTP for ${phoneNumber}: ${otp}`);
        res.json({ success: true, message: "OTP Sent", testCode: otp });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Step 4: OTP Verification & Routing
app.post('/api/v4/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });

        if (!user) return res.status(400).json({ success: false, message: "User not found" });
        if (user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });

        // OTP is correct. Clear it.
        user.otp = null;
        
        // Determine Next Step Logic
        let nextStep = 'home';
        
        // If profile isn't totally complete, find where they left off
        if (user.onboardingStep < 4) {
            if (!user.fullName) nextStep = 'personal';       // Step 5 needed
            else if (!user.device || !user.device.name) nextStep = 'device'; // Step 6 needed
            else if (!user.passwordHash) nextStep = 'password'; // Step 7 needed
        }
        
        await user.save();
        res.json({ success: true, nextStep: nextStep, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Step 5: Personal Profile Save
app.post('/api/v4/onboarding/personal', async (req, res) => {
    try {
        const { phoneNumber, fullName, email, dob } = req.body;
        const user = await User.findOne({ phoneNumber });
        if(!user) return res.status(404).json({success: false});

        user.fullName = fullName;
        user.email = email;
        user.dob = dob;
        user.onboardingStep = 2; // Marked Personal as Done
        await user.save();

        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Step 6: Device Profile Save
app.post('/api/v4/onboarding/device', async (req, res) => {
    try {
        const { phoneNumber, deviceName, type, imei } = req.body;
        const user = await User.findOne({ phoneNumber });
        if(!user) return res.status(404).json({success: false});

        user.device = { name: deviceName, type, imei };
        user.onboardingStep = 3; // Marked Device as Done
        await user.save();

        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Step 7: Password Creation
app.post('/api/v4/onboarding/password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if(!user) return res.status(404).json({success: false});

        user.setPassword(password); // Secure Hash
        user.onboardingStep = 4;    // Fully Complete
        await user.save();

        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Login via Password (For returning users)
app.post('/api/v4/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });

        if (!user) return res.status(400).json({ success: false, message: "User not found" });
        
        // Use the secure validation method
        if (!user.validatePassword(password)) {
            return res.status(400).json({ success: false, message: "Wrong Password" });
        }

        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Mock Lookups (For Home Page features)
app.get('/api/v1/lookup/call/:number', (req, res) => res.json({ status: 'unverified' }));
app.get('/api/v1/lookup/directory', (req, res) => res.json([]));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 V4.0 Server running on port ${PORT}`); });