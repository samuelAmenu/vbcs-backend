/* ==================================================
   VBCS MASTER SERVER V9.1 (Production & Static Serving)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path'); // Added for serving HTML
const app = express();

// 1. MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Support for large Profile Pictures
app.use(express.static(__dirname)); // ✅ SERVES public.html automatically

// 2. DATABASE CONNECTION
const MONGO_URI = "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to Database...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ DB Connection Error:', err.message));

// ==========================================
// 3. DATABASE SCHEMAS
// ==========================================

const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String,
    
    // Profile Data
    fullName: String,
    email: String,
    age: Number,
    secondaryPhone: String,
    profilePic: String, // Base64 Image String
    inviteCode: { type: String, unique: true },
    
    // Status Data
    device: { name: String, imei: String, type: { type: String, default: 'Mobile' } },
    location: { lat: Number, lng: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 }, // New in V8
    
    // Social
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    invites: [{ fromName: String, fromPhone: String, date: { type: Date, default: Date.now } }],
    
    // Auth State
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Password Methods
userSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};
userSchema.methods.validatePassword = function(password) {
    if (!this.passwordHash || !this.salt) return false;
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};

// Auto-Generate Invite Code
userSchema.pre('save', function(next) {
    if (!this.inviteCode) {
        this.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    next();
});

const User = mongoose.model('User', userSchema);
const DirectoryEntry = mongoose.model('DirectoryEntry', new mongoose.Schema({ phoneNumber: String, companyName: String, category: String, status: { type: String, default: 'Verified' } }));
const SpamReport = mongoose.model('SpamReport', new mongoose.Schema({ number: String, reason: String, comments: String, status: { type: String, default: 'Pending' }, createdAt: { type: Date, default: Date.now } }));
const Enterprise = mongoose.model('Enterprise', new mongoose.Schema({ companyName: String, contactPerson: String, phone: String, plan: String, status: { type: String, default: 'Active' }, createdAt: { type: Date, default: Date.now } }));

// ==========================================
// 4. SHARED LOGIC (The Optimization)
// ==========================================

const handleOtpRequest = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        
        // Generate 6-digit Code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000); // 5 Mins
        await user.save();
        
        console.log(`OTP Generated for ${phoneNumber}: ${otp}`);
        res.json({ success: true, testCode: otp });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const handleOtpVerify = async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null;
        
        // Determine Routing
        let nextStep = 'home';
        if (user.onboardingStep < 4) {
            if (!user.fullName) nextStep = 'personal';
            else if (!user.device || !user.device.name) nextStep = 'device';
            else if (!user.passwordHash) nextStep = 'password';
        }
        await user.save();
        res.json({ success: true, nextStep, user });
    } catch (err) { res.status(500).json({ success: false }); }
};

const handleLogin = async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || !user.validatePassword(password)) return res.status(400).json({ success: false, message: "Invalid Credentials" });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
};

// ==========================================
// 5. API ROUTES
// ==========================================

// --- AUTH (V9 & V6) ---
app.post('/api/v9/auth/otp-request', handleOtpRequest);
app.post('/api/v6/auth/otp-request', handleOtpRequest); // Legacy Support

app.post('/api/v9/auth/otp-verify', handleOtpVerify);
app.post('/api/v6/auth/otp-verify', handleOtpVerify);

app.post('/api/v9/auth/login', handleLogin);
app.post('/api/v6/auth/login', handleLogin);

// --- ONBOARDING (V9 - With Images) ---
app.post('/api/v9/onboarding/personal', async (req, res) => {
    try {
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 2 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.post('/api/v9/onboarding/device', async (req, res) => {
    try {
        const deviceData = { name: req.body.deviceName, imei: req.body.imei, type: 'Mobile' };
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { device: deviceData, onboardingStep: 3 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.post('/api/v9/onboarding/password', async (req, res) => {
    try {
        const user = await User.findOne({ phoneNumber: req.body.phoneNumber });
        user.setPassword(req.body.password);
        user.onboardingStep = 4;
        await user.save();
        res.json({ success: true, user });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- GUARDIAN PRO (V9 - Battery & Invites) ---
app.post('/api/v9/guardian/location', async (req, res) => {
    try {
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { 
            location: { lat: req.body.lat, lng: req.body.lng, updatedAt: new Date() },
            batteryLevel: req.body.battery || 100 // ✅ Saves Battery
        });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.post('/api/v9/guardian/join', async (req, res) => {
    try {
        const { myPhone, inviteCode } = req.body;
        const target = await User.findOne({ inviteCode });
        const me = await User.findOne({ phoneNumber: myPhone });
        
        if (!target) return res.status(404).json({ success: false, message: "Code not found" });
        
        // Add to each other's circle if not present
        if (!target.circle.some(c => c.phone === me.phoneNumber)) {
            target.circle.push({ phone: me.phoneNumber, name: me.fullName });
            me.circle.push({ phone: target.phoneNumber, name: target.fullName });
            await target.save();
            await me.save();
        }
        res.json({ success: true, targetName: target.fullName });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    try {
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
                    pic: u.profilePic, // Image
                    battery: u.batteryLevel, // Battery
                    initials: u.fullName ? u.fullName.substring(0,2).toUpperCase() : 'NA'
                });
            }
        }
        res.json({ success: true, circle: mapData, myCode: me.inviteCode });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- TOOLS & ADMIN (V9) ---
app.get('/api/v9/lookup/call/:n', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.n }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unverified' }); });
app.get('/api/v9/lookup/sms/:s', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.s }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unknown' }); });
app.get('/api/v9/lookup/directory', async (req, res) => { res.json(await DirectoryEntry.find().limit(50)); });
app.post('/api/v9/reports', async (req, res) => { await new SpamReport(req.body).save(); res.json({ success: true }); });

// Admin Routes (Owner)
const ownerLogin = (req, res) => { if(req.body.password==='admin123') res.json({success:true}); else res.status(401).json({}); };
app.post('/api/v6/owner/login', ownerLogin);
app.post('/api/v1/owner/login', ownerLogin); // Backward Compatibility

app.get('/api/v6/owner/stats', async (req, res) => res.json({ totalRevenue: 50000, users: await User.countDocuments(), enterprises: await Enterprise.countDocuments() }));
app.post('/api/v6/owner/directory/bulk', async (req, res) => { if(Array.isArray(req.body.entries)) await DirectoryEntry.insertMany(req.body.entries); res.json({ success: true }); });
app.get('/api/v6/owner/subscribers/b2c', async (req, res) => res.json(await User.find().limit(50)));
app.get('/api/v6/owner/subscribers/b2b', async (req, res) => res.json(await Enterprise.find().limit(50)));
app.post('/api/v6/owner/directory/add', async (req, res) => { try { const entry = new DirectoryEntry(req.body); await entry.save(); res.json({ success: true }); } catch(err) { res.status(500).json({ success: false }); } });
app.get('/api/v6/owner/directory/list', async (req, res) => { try { res.json(await DirectoryEntry.find().sort({ companyName: 1 }).limit(100)); } catch(err) { res.status(500).json([]); } });
app.get('/api/v6/owner/fraud-reports', async (req, res) => { try { res.json(await SpamReport.find().sort({ createdAt: -1 }).limit(20)); } catch(err) { res.status(500).json([]); } });
app.post('/api/v6/owner/suspend-number', async (req, res) => { try { await SpamReport.updateMany({ number: req.body.number }, { status: 'Suspended' }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); } });

// --- SERVE FRONTEND ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 V9.1 Master Server running on port ${PORT}`); });