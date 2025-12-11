/* ==================================================
   VBCS SERVER V5.0 (Guardian & Family Engine)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ✅ FIXED: Added the missing closing quote (") before the semicolon
const MONGO_URI = "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to MongoDB...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
      console.error('❌ DB Error:', err.message);
      console.log("HINT: Ensure your IP is whitelisted (0.0.0.0/0) in MongoDB Atlas.");
  });

// --- 1. USER SCHEMA (Includes Guardian Fields) ---
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String,
    fullName: String,
    email: String,
    dob: String,
    
    // Guardian & Device
    device: { name: String, imei: String, type: String },
    location: { lat: Number, lng: Number, updatedAt: Date },
    
    // Family Circle
    circle: [{ 
        phone: String,
        name: String, // "Wife", "Dad"
        status: { type: String, default: 'pending' } // pending, active
    }],
    invites: [{
        fromName: String,
        fromPhone: String,
        date: { type: Date, default: Date.now }
    }],
    
    // Auth & State
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Password Logic
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

// Report Schema
const reportSchema = new mongoose.Schema({
    number: String,
    reason: String,
    comments: String,
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});
const SpamReport = mongoose.model('SpamReport', reportSchema);

// Directory Schema
const directorySchema = new mongoose.Schema({
    phoneNumber: String,
    companyName: String,
    category: String,
    status: { type: String, default: 'Verified' }
});
const DirectoryEntry = mongoose.model('DirectoryEntry', directorySchema);

// Enterprise Schema
const enterpriseSchema = new mongoose.Schema({
    companyName: String,
    monthlyBill: Number,
    status: { type: String, default: 'Active' },
    tier: String
});
const Enterprise = mongoose.model('Enterprise', enterpriseSchema);


// --- 2. AUTH ROUTES ---

// Request OTP
app.post('/api/v4/auth/otp-request', async (req, res) => {
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

// Verify OTP
app.post('/api/v4/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false });
        
        user.otp = null;
        let nextStep = 'home';
        
        // Strict Step Check
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
app.post('/api/v4/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || !user.validatePassword(password)) return res.status(400).json({ success: false });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- 3. ONBOARDING ROUTES ---
app.post('/api/v4/onboarding/personal', async (req, res) => {
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 2 });
    res.json({ success: true });
});
app.post('/api/v4/onboarding/device', async (req, res) => {
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { device: req.body, onboardingStep: 3 });
    res.json({ success: true });
});
app.post('/api/v4/onboarding/password', async (req, res) => {
    const user = await User.findOne({ phoneNumber: req.body.phoneNumber });
    user.setPassword(req.body.password);
    user.onboardingStep = 4;
    await user.save();
    res.json({ success: true, user });
});

// --- 4. GUARDIAN ROUTES ---

// Update GPS
app.post('/api/v4/guardian/location', async (req, res) => {
    const { phoneNumber, lat, lng } = req.body;
    await User.findOneAndUpdate({ phoneNumber }, { location: { lat, lng, updatedAt: new Date() } });
    res.json({ success: true });
});

// Invite Family Member
app.post('/api/v4/guardian/invite', async (req, res) => {
    try {
        const { myPhone, targetPhone, name } = req.body;
        const me = await User.findOne({ phoneNumber: myPhone });
        const target = await User.findOne({ phoneNumber: targetPhone });

        if (!target) return res.status(404).json({ success: false, message: "User not found" });

        // Add to MY circle (pending)
        me.circle.push({ phone: targetPhone, name: name, status: 'pending' });
        
        // Add invite to TARGET's list
        target.invites.push({ fromName: me.fullName, fromPhone: me.phoneNumber });
        
        await me.save();
        await target.save();
        
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// Get Map Data & Invites
app.get('/api/v4/guardian/circle', async (req, res) => {
    try {
        const { phone } = req.query;
        const me = await User.findOne({ phoneNumber: phone });
        
        const mapData = [];
        // Loop through circle and get their locations
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

// --- 5. UTILS ---
app.post('/api/v1/reports', async (req, res) => {
    try {
        const { number, reason, comments } = req.body;
        const newReport = new SpamReport({ number, reason, comments });
        await newReport.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/api/v1/lookup/call/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const dirMatch = await DirectoryEntry.findOne({ phoneNumber: number });
        if(dirMatch) return res.json({ status: 'verified', name: dirMatch.companyName });
        const spamCount = await SpamReport.countDocuments({ number: number });
        if(spamCount > 0) return res.json({ status: 'warning', count: spamCount });
        res.json({ status: 'unverified' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

app.get('/api/v1/lookup/directory', async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};
        if (category && category !== 'All') query.category = category;
        const results = await DirectoryEntry.find(query).limit(50);
        res.json(results);
    } catch (err) { res.status(500).json([]); }
});

/* --- OWNER DASHBOARD --- */
app.post('/api/v1/owner/login', (req, res) => {
    const { username, password } = req.body;
    if(username === 'owner' && password === 'admin123') res.json({ success: true });
    else res.json({ success: false, message: "Invalid credentials" });
});

app.get('/api/v1/owner/stats', async (req, res) => {
    try {
        res.json({
            totalMonthlyRevenue: 50000, 
            totalEnterprises: await Enterprise.countDocuments(),
            totalB2CSubscribers: await User.countDocuments()
        });
    } catch(err) { res.status(500).json({}); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 Server running on port ${PORT}`); });