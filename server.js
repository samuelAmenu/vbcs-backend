/* ==================================================
   VBCS SERVER V6.0 (Master Build)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ⚠️ DATABASE CONNECTION
const MONGO_URI = "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to MongoDB...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
      console.error('❌ DB Error:', err.message);
      console.log("HINT: Check Network Access in MongoDB Atlas (Whitelist 0.0.0.0/0)");
  });

// --- 1. SCHEMAS ---

// User Schema (Complete Profile)
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String,
    
    // Identity
    fullName: String,
    email: String,
    age: Number,            // V6 Feature
    secondaryPhone: String, // V6 Feature
    dob: String,
    
    // Device
    device: { 
        name: { type: String, default: '' },
        imei: { type: String, default: '' },
        type: { type: String, default: 'Mobile' }
    },
    
    // Guardian Engine
    location: { lat: Number, lng: Number, updatedAt: Date },
    circle: [{ 
        phone: String,
        name: String, 
        status: { type: String, default: 'pending' }
    }],
    invites: [{
        fromName: String,
        fromPhone: String,
        date: { type: Date, default: Date.now }
    }],
    
    // State
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 }, // 0=New, 2=Personal, 3=Device, 4=Complete
    createdAt: { type: Date, default: Date.now }
});

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

// Data Models
const SpamReport = mongoose.model('SpamReport', new mongoose.Schema({
    number: String, reason: String, comments: String, status: { type: String, default: 'Pending' }, createdAt: { type: Date, default: Date.now }
}));

const DirectoryEntry = mongoose.model('DirectoryEntry', new mongoose.Schema({
    phoneNumber: String, companyName: String, category: String, status: { type: String, default: 'Verified' }
}));

// --- 2. AUTH & ONBOARDING ROUTES ---

// OTP Request
app.post('/api/v6/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000);
        await user.save();
        res.json({ success: true, testCode: otp });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// OTP Verify
app.post('/api/v6/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null;
        
        // Smart Routing Logic
        let nextStep = 'home';
        if (user.onboardingStep < 4) {
            if (!user.fullName) nextStep = 'personal';
            else if (!user.device || !user.device.name) nextStep = 'device';
            else if (!user.passwordHash) nextStep = 'password';
        }
        
        await user.save();
        res.json({ success: true, nextStep, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Password Login
app.post('/api/v6/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || !user.validatePassword(password)) return res.status(400).json({ success: false, message: "Invalid Credentials" });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Wizard Step 1: Personal (V6 Upgrade: Added Age, Secondary Phone)
app.post('/api/v6/onboarding/personal', async (req, res) => {
    try {
        const { phoneNumber, fullName, email, age, secondaryPhone } = req.body;
        await User.findOneAndUpdate({ phoneNumber }, { fullName, email, age, secondaryPhone, onboardingStep: 2 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// Wizard Step 2: Device
app.post('/api/v6/onboarding/device', async (req, res) => {
    try {
        const { phoneNumber, deviceName, imei } = req.body;
        const deviceData = { name: deviceName, imei: imei, type: 'Mobile' };
        await User.findOneAndUpdate({ phoneNumber }, { device: deviceData, onboardingStep: 3 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// Wizard Step 3: Password
app.post('/api/v6/onboarding/password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        user.setPassword(password);
        user.onboardingStep = 4;
        await user.save();
        res.json({ success: true, user });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- 3. SECURITY TOOLS ROUTES ---

// Caller ID Check
app.get('/api/v6/lookup/call/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const dirMatch = await DirectoryEntry.findOne({ phoneNumber: number });
        if(dirMatch) return res.json({ status: 'verified', name: dirMatch.companyName, category: dirMatch.category });
        
        const spamCount = await SpamReport.countDocuments({ number: number });
        if(spamCount > 0) return res.json({ status: 'warning', count: spamCount });
        
        res.json({ status: 'unverified' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

// SMS Sender Check (New V6 Feature)
app.get('/api/v6/lookup/sms/:sender', async (req, res) => {
    try {
        const { sender } = req.params;
        // Logic: Check against known shortcodes in Directory
        const dirMatch = await DirectoryEntry.findOne({ phoneNumber: sender }); // e.g. "8989"
        if(dirMatch) return res.json({ status: 'verified', name: dirMatch.companyName });
        
        const spamCount = await SpamReport.countDocuments({ number: sender });
        if(spamCount > 0) return res.json({ status: 'danger', count: spamCount });
        
        res.json({ status: 'unknown' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

// Directory Listing
app.get('/api/v6/lookup/directory', async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};
        if (category && category !== 'All') query.category = category;
        const results = await DirectoryEntry.find(query).limit(50);
        res.json(results);
    } catch (err) { res.status(500).json([]); }
});

// Report Submission
app.post('/api/v6/reports', async (req, res) => {
    try {
        const { number, reason, comments } = req.body;
        const newReport = new SpamReport({ number, reason, comments });
        await newReport.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- 4. GUARDIAN ENGINE ROUTES ---

app.post('/api/v6/guardian/location', async (req, res) => {
    const { phoneNumber, lat, lng } = req.body;
    await User.findOneAndUpdate({ phoneNumber }, { location: { lat, lng, updatedAt: new Date() } });
    res.json({ success: true });
});

app.post('/api/v6/guardian/invite', async (req, res) => {
    try {
        const { myPhone, targetPhone, name } = req.body;
        const me = await User.findOne({ phoneNumber: myPhone });
        const target = await User.findOne({ phoneNumber: targetPhone });

        if (!target) return res.status(404).json({ success: false, message: "User not found" });

        me.circle.push({ phone: targetPhone, name: name, status: 'pending' });
        target.invites.push({ fromName: me.fullName, fromPhone: me.phoneNumber });
        
        await me.save();
        await target.save();
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.get('/api/v6/guardian/circle', async (req, res) => {
    try {
        const { phone } = req.query;
        const me = await User.findOne({ phoneNumber: phone });
        if(!me) return res.json({ success: true, circle: [], invites: [] });

        const mapData = [];
        for (let member of me.circle) {
            const u = await User.findOne({ phoneNumber: member.phone });
            if (u && u.location) {
                mapData.push({ 
                    name: member.name, 
                    phone: member.phone, 
                    lat: u.location.lat, 
                    lng: u.location.lng 
                });
            }
        }
        res.json({ success: true, circle: mapData, invites: me.invites });
    } catch(err) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 V6.0 Server running on port ${PORT}`); });