/* ==================================================
   VBCS SERVER V6.3 (Final Stable Build)
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

// User Schema (Fixed Device Object)
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String,
    fullName: String,
    email: String,
    age: Number,
    secondaryPhone: String,
    dob: String,
    // ✅ Device is strictly an Object now
    device: { 
        name: { type: String, default: '' }, 
        imei: { type: String, default: '' }, 
        type: { type: String, default: 'Mobile' } 
    },
    location: { lat: Number, lng: Number, updatedAt: Date },
    circle: [{ phone: String, name: String, status: { type: String, default: 'pending' } }],
    invites: [{ fromName: String, fromPhone: String, date: { type: Date, default: Date.now } }],
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
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

const SpamReport = mongoose.model('SpamReport', new mongoose.Schema({
    number: String, reason: String, comments: String, status: { type: String, default: 'Pending' }, createdAt: { type: Date, default: Date.now }
}));

const DirectoryEntry = mongoose.model('DirectoryEntry', new mongoose.Schema({
    phoneNumber: String, companyName: String, category: String, status: { type: String, default: 'Verified' }
}));

// --- 2. AUTH ROUTES ---

app.post('/api/v6/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000);
        await user.save();
        res.json({ success: true, testCode: otp });
    } catch (err) { 
        console.error("OTP Error:", err);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.post('/api/v6/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null;
        let nextStep = 'home';
        if (user.onboardingStep < 4) {
            if (!user.fullName) nextStep = 'personal';
            else if (!user.device || !user.device.name) nextStep = 'device';
            else if (!user.passwordHash) nextStep = 'password';
        }
        await user.save();
        res.json({ success: true, nextStep, user });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/v6/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || !user.validatePassword(password)) return res.status(400).json({ success: false, message: "Invalid Credentials" });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- 3. ONBOARDING ROUTES ---
app.post('/api/v6/onboarding/personal', async (req, res) => {
    try {
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 2 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/v6/onboarding/device', async (req, res) => {
    try {
        const { phoneNumber, deviceName, imei } = req.body;
        // Strict object mapping
        const deviceData = { name: deviceName, imei: imei, type: 'Mobile' };
        await User.findOneAndUpdate({ phoneNumber }, { device: deviceData, onboardingStep: 3 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/v6/onboarding/password', async (req, res) => {
    try {
        const user = await User.findOne({ phoneNumber: req.body.phoneNumber });
        user.setPassword(req.body.password);
        user.onboardingStep = 4;
        await user.save();
        res.json({ success: true, user });
    } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- 4. GUARDIAN & FEATURES ---
app.get('/api/v6/lookup/call/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const dirMatch = await DirectoryEntry.findOne({ phoneNumber: number });
        if(dirMatch) return res.json({ status: 'verified', name: dirMatch.companyName });
        const spamCount = await SpamReport.countDocuments({ number: number });
        if(spamCount > 0) return res.json({ status: 'warning', count: spamCount });
        res.json({ status: 'unverified' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

app.get('/api/v6/lookup/sms/:sender', async (req, res) => {
    try {
        const { sender } = req.params;
        const dirMatch = await DirectoryEntry.findOne({ phoneNumber: sender });
        if(dirMatch) return res.json({ status: 'verified', name: dirMatch.companyName });
        const spamCount = await SpamReport.countDocuments({ number: sender });
        if(spamCount > 0) return res.json({ status: 'danger', count: spamCount });
        res.json({ status: 'unknown' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

app.get('/api/v6/lookup/directory', async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};
        if (category && category !== 'All') query.category = category;
        const results = await DirectoryEntry.find(query).limit(50);
        res.json(results);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/v6/reports', async (req, res) => {
    try {
        const { number, reason, comments } = req.body;
        const newReport = new SpamReport({ number, reason, comments });
        await newReport.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Guardian Engine
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
            if (u && u.location) mapData.push({ name: member.name, phone: member.phone, lat: u.location.lat, lng: u.location.lng });
        }
        res.json({ success: true, circle: mapData, invites: me.invites });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- 5. OWNER DASHBOARD ROUTES (V6) ---

const ownerLoginHandler = (req, res) => {
    const { username, password } = req.body;
    if(username === 'owner' && password === 'admin123') res.json({ success: true });
    else res.status(401).json({ success: false, message: "Invalid credentials" });
};

// V6 Routes
app.post('/api/v6/owner/login', ownerLoginHandler);
app.get('/api/v6/owner/stats', async (req, res) => {
    try { res.json({ totalRevenue: 50000, users: await User.countDocuments() }); } catch(err) { res.status(500).json({}); }
});
app.get('/api/v6/owner/fraud-reports', async (req, res) => {
    try { res.json(await SpamReport.find().sort({ createdAt: -1 }).limit(20)); } catch(err) { res.status(500).json([]); }
});
app.post('/api/v6/owner/suspend-number', async (req, res) => {
    try { await SpamReport.updateMany({ number: req.body.number }, { status: 'Suspended' }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ NEW: DIRECTORY UPLOAD ROUTE
app.post('/api/v6/owner/directory/add', async (req, res) => {
    try {
        const { companyName, phoneNumber, category } = req.body;
        const entry = new DirectoryEntry({ companyName, phoneNumber, category });
        await entry.save();
        res.json({ success: true, message: "Added" });
    } catch(err) { 
        console.error("Directory Add Error:", err);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.get('/api/v6/owner/directory/list', async (req, res) => {
    try {
        const list = await DirectoryEntry.find().sort({ companyName: 1 }).limit(100);
        res.json(list);
    } catch(err) { res.status(500).json([]); }
});

// V1 Backward Compatibility
app.post('/api/v1/owner/login', ownerLoginHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 V6.3 Server running on port ${PORT}`); });