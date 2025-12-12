/* ==================================================
   VBCS MASTER SERVER V8.0 (Final: Admin + Guardian Pro)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for Image Uploads

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
// 1. SCHEMAS
// ==========================================

const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String,
    
    // Identity (V8 Upgrade)
    fullName: String,
    email: String,
    age: Number,
    secondaryPhone: String,
    profilePic: String, // Base64 Image
    inviteCode: { type: String, unique: true }, // For family invites
    
    // Device
    device: { 
        name: { type: String, default: '' }, 
        imei: { type: String, default: '' }, 
        type: { type: String, default: 'Mobile' } 
    },
    
    // Guardian Engine
    location: { lat: Number, lng: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 },
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    invites: [{ fromName: String, fromPhone: String, date: { type: Date, default: Date.now } }],
    
    // State
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

userSchema.methods.setPassword = function(p) { this.salt = crypto.randomBytes(16).toString('hex'); this.passwordHash = crypto.pbkdf2Sync(p, this.salt, 1000, 64, 'sha512').toString('hex'); };
userSchema.methods.validatePassword = function(p) { if(!this.passwordHash) return false; return this.passwordHash === crypto.pbkdf2Sync(p, this.salt, 1000, 64, 'sha512').toString('hex'); };

// Generate unique 6-char invite code before saving
userSchema.pre('save', function(next) {
    if (!this.inviteCode) {
        this.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    next();
});

const User = mongoose.model('User', userSchema);

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
// 2. MOBILE APP ROUTES (V8)
// ==========================================

// AUTH
app.post('/api/v8/auth/otp-request', async (req, res) => {
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

app.post('/api/v8/auth/otp-verify', async (req, res) => {
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
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/v8/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || !user.validatePassword(password)) return res.status(400).json({ success: false, message: "Invalid Credentials" });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ONBOARDING (V8: Includes Picture)
app.post('/api/v8/onboarding/personal', async (req, res) => {
    try {
        // Saves Name, Email, Age, SecPhone, AND ProfilePic
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 2 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.post('/api/v8/onboarding/device', async (req, res) => {
    try {
        const { phoneNumber, deviceName, imei } = req.body;
        const deviceData = { name: deviceName, imei: imei, type: 'Mobile' };
        await User.findOneAndUpdate({ phoneNumber }, { device: deviceData, onboardingStep: 3 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.post('/api/v8/onboarding/password', async (req, res) => {
    try {
        const user = await User.findOne({ phoneNumber: req.body.phoneNumber });
        user.setPassword(req.body.password);
        user.onboardingStep = 4;
        await user.save();
        res.json({ success: true, user });
    } catch(err) { res.status(500).json({ success: false }); }
});

// GUARDIAN V8 (Invite Codes + Images)
app.post('/api/v8/guardian/location', async (req, res) => {
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { location: { lat: req.body.lat, lng: req.body.lng, updatedAt: new Date() } });
    res.json({ success: true });
});

app.post('/api/v8/guardian/join', async (req, res) => {
    const { myPhone, inviteCode } = req.body;
    const target = await User.findOne({ inviteCode });
    const me = await User.findOne({ phoneNumber: myPhone });
    
    if (!target) return res.status(404).json({ success: false, message: "Invalid Code" });
    
    // Bidirectional Link
    target.circle.push({ phone: me.phoneNumber, name: me.fullName });
    me.circle.push({ phone: target.phoneNumber, name: target.fullName });
    
    await target.save();
    await me.save();
    res.json({ success: true, targetName: target.fullName });
});

app.get('/api/v8/guardian/circle', async (req, res) => {
    const me = await User.findOne({ phoneNumber: req.query.phone });
    if (!me) return res.json({ circle: [] });
    
    const mapData = [];
    for (let m of me.circle) {
        const u = await User.findOne({ phoneNumber: m.phone });
        if (u && u.location) {
            mapData.push({ 
                name: u.fullName, 
                phone: u.phoneNumber, 
                lat: u.location.lat, 
                lng: u.location.lng,
                pic: u.profilePic, // Send image for avatar
                initials: u.fullName ? u.fullName.substring(0,2).toUpperCase() : 'NA'
            });
        }
    }
    res.json({ success: true, circle: mapData, myCode: me.inviteCode });
});

// TOOLS & UTILS (V6 Logic)
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
        const newReport = new SpamReport(req.body);
        await newReport.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// ==========================================
// 3. ADMIN / OWNER ROUTES (V6)
// ==========================================

const ownerLoginHandler = (req, res) => {
    const { username, password } = req.body;
    if(username === 'owner' && password === 'admin123') res.json({ success: true });
    else res.status(401).json({ success: false, message: "Invalid credentials" });
};

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
    try { const entry = new DirectoryEntry(req.body); await entry.save(); res.json({ success: true }); } catch(err) { res.status(500).json({ success: false }); }
});

app.post('/api/v6/owner/directory/bulk', async (req, res) => {
    try {
        if(Array.isArray(req.body.entries)) {
            await DirectoryEntry.insertMany(req.body.entries);
            res.json({ success: true, count: req.body.entries.length });
        } else { res.status(400).json({ success: false }); }
    } catch(err) { res.status(500).json({ success: false }); }
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

// Backward Compatibility
app.post('/api/v1/owner/login', ownerLoginHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 V8.0 Master Server running on port ${PORT}`); });