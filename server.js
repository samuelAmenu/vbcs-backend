/* ==================================================
   VBCS MASTER SERVER V7.0 (Final Release)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support large bulk uploads

// ⚠️ DATABASE CONNECTION
const MONGO_URI = "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to MongoDB...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
      console.error('❌ DB Error:', err.message);
      console.log("HINT: Check Network Access in MongoDB Atlas (Whitelist 0.0.0.0/0)");
  });

// ==========================================
// 1. DATABASE SCHEMAS (The Blueprint)
// ==========================================

// User Identity & Guardian Profile
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String,
    
    // Profile
    fullName: String,
    email: String,
    age: Number,
    secondaryPhone: String,
    dob: String,
    
    // Device Fingerprint
    device: { 
        name: { type: String, default: '' }, 
        imei: { type: String, default: '' }, 
        type: { type: String, default: 'Mobile' } 
    },
    
    // Guardian Engine Data
    location: { lat: Number, lng: Number, updatedAt: Date },
    circle: [{ phone: String, name: String, status: { type: String, default: 'pending' } }], // Family
    invites: [{ fromName: String, fromPhone: String, date: { type: Date, default: Date.now } }], // Incoming requests
    
    // Auth State
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

// Security & Business Data
const SpamReport = mongoose.model('SpamReport', new mongoose.Schema({
    number: String, reason: String, comments: String, status: { type: String, default: 'Pending' }, createdAt: { type: Date, default: Date.now }
}));

const DirectoryEntry = mongoose.model('DirectoryEntry', new mongoose.Schema({
    phoneNumber: String, companyName: String, category: String, status: { type: String, default: 'Verified' }
}));

const Enterprise = mongoose.model('Enterprise', new mongoose.Schema({
    companyName: String, contactPerson: String, phone: String, plan: String, status: { type: String, default: 'Active' }, createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// 2. MOBILE APP ROUTES
// ==========================================

// --- AUTHENTICATION ---
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
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/v6/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null;
        let nextStep = 'home';
        // Logic: Force Wizard if profile incomplete
        if (user.onboardingStep < 4) {
            if (!user.fullName) nextStep = 'personal';
            else if (!user.device || !user.device.name) nextStep = 'device';
            else if (!user.passwordHash) nextStep = 'password';
        }
        await user.save();
        res.json({ success: true, nextStep, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/v6/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || !user.validatePassword(password)) return res.status(400).json({ success: false, message: "Invalid Credentials" });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- ONBOARDING WIZARD ---
app.post('/api/v6/onboarding/personal', async (req, res) => {
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 2 });
    res.json({ success: true });
});

app.post('/api/v6/onboarding/device', async (req, res) => {
    const { phoneNumber, deviceName, imei } = req.body;
    const deviceData = { name: deviceName, imei: imei, type: 'Mobile' };
    await User.findOneAndUpdate({ phoneNumber }, { device: deviceData, onboardingStep: 3 });
    res.json({ success: true });
});

app.post('/api/v6/onboarding/password', async (req, res) => {
    const user = await User.findOne({ phoneNumber: req.body.phoneNumber });
    user.setPassword(req.body.password);
    user.onboardingStep = 4; // Complete
    await user.save();
    res.json({ success: true, user });
});

// --- SECURITY TOOLS (Caller ID / SMS) ---
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
        const dirMatch = await DirectoryEntry.findOne({ phoneNumber: sender }); // e.g. "CBE" or "8989"
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
        const newReport = new SpamReport(req.body);
        await newReport.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- GUARDIAN ENGINE (GPS & Family) ---
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
        const me = await User.findOne({ phoneNumber: req.query.phone });
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

// ==========================================
// 3. ADMIN / OWNER ROUTES
// ==========================================

// Authentication Wrapper
const ownerLoginHandler = (req, res) => {
    const { username, password } = req.body;
    if(username === 'owner' && password === 'admin123') res.json({ success: true });
    else res.status(401).json({ success: false, message: "Invalid credentials" });
};

// V6 Endpoints
app.post('/api/v6/owner/login', ownerLoginHandler);

app.get('/api/v6/owner/stats', async (req, res) => {
    try { res.json({ totalRevenue: 50000, users: await User.countDocuments(), enterprises: await Enterprise.countDocuments() }); } catch(err) { res.status(500).json({}); }
});

app.get('/api/v6/owner/fraud-reports', async (req, res) => {
    try { res.json(await SpamReport.find().sort({ createdAt: -1 }).limit(50)); } catch(err) { res.status(500).json([]); }
});

app.post('/api/v6/owner/suspend-number', async (req, res) => {
    try { await SpamReport.updateMany({ number: req.body.number }, { status: 'Suspended' }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

// Directory Management
app.post('/api/v6/owner/directory/add', async (req, res) => {
    try {
        const entry = new DirectoryEntry(req.body);
        await entry.save();
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.post('/api/v6/owner/directory/bulk', async (req, res) => {
    try {
        if(Array.isArray(req.body.entries)) {
            await DirectoryEntry.insertMany(req.body.entries);
            res.json({ success: true, count: req.body.entries.length });
        } else {
            res.status(400).json({ success: false, message: "Invalid Format" });
        }
    } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/v6/owner/directory/list', async (req, res) => {
    try { res.json(await DirectoryEntry.find().sort({ companyName: 1 }).limit(100)); } catch(err) { res.status(500).json([]); }
});

// Subscriber Lists
app.get('/api/v6/owner/subscribers/b2c', async (req, res) => {
    try { res.json(await User.find({}, 'fullName phoneNumber age email createdAt onboardingStep').sort({createdAt:-1}).limit(100)); } catch(err) { res.status(500).json([]); }
});

app.get('/api/v6/owner/subscribers/b2b', async (req, res) => {
    try { res.json(await Enterprise.find().sort({createdAt:-1}).limit(100)); } catch(err) { res.status(500).json([]); }
});

app.post('/api/v6/owner/subscribers/b2b/add', async (req, res) => {
    try { const ent = new Enterprise(req.body); await ent.save(); res.json({ success: true }); } catch(err) { res.status(500).json({ success: false }); }
});

// Backward Compatibility (Prevent 404s on old caches)
app.post('/api/v1/owner/login', ownerLoginHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 VBCS V7.0 Server running on port ${PORT}`); });