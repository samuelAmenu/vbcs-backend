/* ==================================================
   VBCS MASTER SERVER V9.0 (Production Verified)
   ================================================== */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // CRITICAL for Image Uploads

const MONGO_URI = "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ System Starting...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Database Linked'))
  .catch(err => console.error('❌ DB Error:', err.message));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String, salt: String,
    
    // Profile
    fullName: String, email: String, age: Number, secondaryPhone: String,
    profilePic: String, // Base64 Image
    inviteCode: { type: String, unique: true },
    
    // Status
    device: { name: String, imei: String },
    location: { lat: Number, lng: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 }, // ✅ V9 Feature
    
    // Social
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    
    // Auth
    otp: String, onboardingStep: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }
});

userSchema.methods.setPassword = function(p) { this.salt = crypto.randomBytes(16).toString('hex'); this.passwordHash = crypto.pbkdf2Sync(p, this.salt, 1000, 64, 'sha512').toString('hex'); };
userSchema.methods.validatePassword = function(p) { if(!this.passwordHash) return false; return this.passwordHash === crypto.pbkdf2Sync(p, this.salt, 1000, 64, 'sha512').toString('hex'); };
userSchema.pre('save', function(next) { if (!this.inviteCode) this.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase(); next(); });

const User = mongoose.model('User', userSchema);
const DirectoryEntry = mongoose.model('DirectoryEntry', new mongoose.Schema({ phoneNumber: String, companyName: String, category: String }));
const SpamReport = mongoose.model('SpamReport', new mongoose.Schema({ number: String, reason: String, status: { type: String, default: 'Pending' } }));
const Enterprise = mongoose.model('Enterprise', new mongoose.Schema({ companyName: String, contactPerson: String, phone: String, status: 'Active' }));

// --- API V9 ROUTES ---

// 1. AUTHENTICATION
app.post('/api/v9/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        let u = await User.findOne({ phoneNumber });
        if (!u) u = new User({ phoneNumber });
        u.otp = otp; 
        await u.save();
        console.log(`OTP Sent to ${phoneNumber}: ${otp}`);
        res.json({ success: true, testCode: otp });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/v9/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const u = await User.findOne({ phoneNumber });
        if (!u || u.otp !== code) return res.status(400).json({ success: false });
        
        u.otp = null;
        let next = 'home';
        if (u.onboardingStep < 4) {
            if (!u.fullName) next = 'personal';
            else if (!u.device || !u.device.name) next = 'device';
            else if (!u.passwordHash) next = 'password';
        }
        await u.save();
        res.json({ success: true, nextStep: next, user: u });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/v9/auth/login', async (req, res) => {
    const { phoneNumber, password } = req.body;
    const u = await User.findOne({ phoneNumber });
    if (!u || !u.validatePassword(password)) return res.status(400).json({ success: false });
    res.json({ success: true, user: u });
});

// 2. ONBOARDING (Data Saving)
app.post('/api/v9/onboarding/personal', async (req, res) => { await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 2 }); res.json({ success: true }); });
app.post('/api/v9/onboarding/device', async (req, res) => { await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { device: req.body, onboardingStep: 3 }); res.json({ success: true }); });
app.post('/api/v9/onboarding/password', async (req, res) => { const u = await User.findOne({ phoneNumber: req.body.phoneNumber }); u.setPassword(req.body.password); u.onboardingStep = 4; await u.save(); res.json({ success: true, user: u }); });

// 3. GUARDIAN ENGINE (Map & Family)
app.post('/api/v9/guardian/location', async (req, res) => {
    // ✅ SAVES BATTERY LEVEL NOW
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { 
        location: { lat: req.body.lat, lng: req.body.lng, updatedAt: new Date() },
        batteryLevel: req.body.battery || 100 
    });
    res.json({ success: true });
});

app.post('/api/v9/guardian/join', async (req, res) => {
    const { myPhone, inviteCode } = req.body;
    const target = await User.findOne({ inviteCode });
    const me = await User.findOne({ phoneNumber: myPhone });
    
    if (!target) return res.status(404).json({ success: false });
    
    // Prevent duplicates
    if (!target.circle.some(c => c.phone === me.phoneNumber)) {
        target.circle.push({ phone: me.phoneNumber, name: me.fullName });
        me.circle.push({ phone: target.phoneNumber, name: target.fullName });
        await target.save();
        await me.save();
    }
    res.json({ success: true, targetName: target.fullName });
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    const me = await User.findOne({ phoneNumber: req.query.phone });
    if (!me) return res.json({ circle: [] });
    
    const mapData = [];
    for (let m of me.circle) {
        const u = await User.findOne({ phoneNumber: m.phone });
        if (u && u.location) {
            mapData.push({ 
                name: u.fullName, phone: u.phoneNumber, 
                lat: u.location.lat, lng: u.location.lng,
                pic: u.profilePic, 
                battery: u.batteryLevel, // ✅ SENDS BATTERY
                initials: u.fullName ? u.fullName.substring(0,2).toUpperCase() : 'NA'
            });
        }
    }
    res.json({ success: true, circle: mapData, myCode: me.inviteCode });
});

// 4. ADMIN & UTILS
app.get('/api/v9/lookup/call/:n', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.n }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unverified' }); });
app.get('/api/v9/lookup/sms/:s', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.s }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unknown' }); });
app.post('/api/v9/reports', async (req, res) => { await new SpamReport(req.body).save(); res.json({ success: true }); });

// Owner Dashboard
app.post('/api/v9/owner/login', (req, res) => req.body.password==='admin123' ? res.json({success:true}) : res.status(401).json({}));
app.get('/api/v9/owner/stats', async (req, res) => res.json({ totalRevenue: 50000, users: await User.countDocuments(), enterprises: await Enterprise.countDocuments() }));
app.post('/api/v9/owner/directory/bulk', async (req, res) => { if(Array.isArray(req.body.entries)) await DirectoryEntry.insertMany(req.body.entries); res.json({ success: true }); });
app.get('/api/v9/owner/directory/list', async (req, res) => res.json(await DirectoryEntry.find().limit(50)));
app.get('/api/v9/owner/subscribers/b2c', async (req, res) => res.json(await User.find().limit(50)));
app.get('/api/v9/owner/subscribers/b2b', async (req, res) => res.json(await Enterprise.find().limit(50)));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 V9.0 Server running on port ${PORT}`); });