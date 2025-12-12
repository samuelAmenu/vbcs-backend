/* ==================================================
   VBCS MASTER SERVER V12.1 (FIXED AUTH & FEATURES)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const http = require('http'); 
const { Server } = require("socket.io"); 

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { cors: { origin: "*" } }); 

// 1. MIDDLEWARE
app.use(cors()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname)); 

// 2. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ VBCS V12.1 Engine: Ready & Connected'))
  .catch(err => console.error('❌ DB Error:', err.message));

// ==========================================
// 3. SCHEMAS
// ==========================================

// A. USER SCHEMA
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true }, 
    passwordHash: String,
    salt: String,
    fullName: String,
    email: String,
    profilePic: String, 
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    savedPlaces: [{ label: String, lat: Number, lng: Number, icon: String }],
    
    // Lost Mode
    status: { type: String, enum: ['Safe', 'Lost', 'SOS'], default: 'Safe' },
    lostModeConfig: {
        message: { type: String, default: "If found, please call 9449." },
        audioAlertActive: { type: Boolean, default: false }
    },

    // Auth & Status
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    location: { lat: Number, lng: Number, speed: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 }
});

userSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    // Sync version for simplicity in V12 fix
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};
userSchema.methods.validatePassword = function(password) {
    if (!this.passwordHash || !this.salt) return false;
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};

const User = mongoose.model('User', userSchema);

// B. DIRECTORY & REPORTS
const DirectoryEntry = mongoose.model('DirectoryEntry', new mongoose.Schema({
    companyName: String, phoneNumber: String, category: String, 
    email: String, officeAddress: String, isVerified: { type: Boolean, default: true }
}));

const SpamReport = mongoose.model('SpamReport', new mongoose.Schema({
    reportedNumber: String, reporterPhone: String, reason: String, comments: String, createdAt: { type: Date, default: Date.now }
}));

const SuspiciousNumber = mongoose.model('SuspiciousNumber', new mongoose.Schema({
    phoneNumber: String, reportCount: { type: Number, default: 0 }, status: { type: String, default: 'Warning' }
}));

// ==========================================
// 4. REAL-TIME ENGINE
// ==========================================

io.on('connection', (socket) => {
    socket.on('join_room', (phone) => { socket.join(phone); });

    socket.on('ping_location', async (data) => {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber: data.phone }, 
                { location: { lat: data.lat, lng: data.lng, updatedAt: new Date() }, batteryLevel: data.battery },
                { new: true }
            );
            socket.broadcast.emit('friend_moved', data);

            // LOST MODE CHECK
            if (user && user.status === 'Lost') {
                socket.emit('command_execute', { 
                    command: 'ACTIVATE_LOST_MODE', 
                    message: user.lostModeConfig.message,
                    playSiren: user.lostModeConfig.audioAlertActive
                });
            }
        } catch (e) { console.error(e); }
    });

    socket.on('trigger_sos', async (data) => {
        const user = await User.findOne({ phoneNumber: data.phone });
        if(user && user.circle) {
             user.circle.forEach(member => {
                 io.to(member.phone).emit('sos_alert', { fromName: user.fullName, lat: data.lat, lng: data.lng });
             });
        }
    });
});

// ==========================================
// 5. API ROUTES (RESTORED AUTH)
// ==========================================

// --- A. AUTHENTICATION (The Missing Link) ---

// 1. Request OTP
app.post('/api/v9/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        
        // Generate Fixed Test Code for Stability: "123456"
        // In Prod: const otp = crypto.randomInt(100000, 999999).toString();
        const otp = "123456"; 
        
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000); 
        await user.save();
        
        console.log(`🔑 OTP for ${phoneNumber}: ${otp}`);
        res.json({ success: true, testCode: otp }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 2. Verify OTP (RESTORED)
app.post('/api/v9/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null; // Clear OTP
        
        // Determine Routing
        let nextStep = 'home';
        if (user.onboardingStep < 2 && !user.fullName) nextStep = 'wizard'; // Send to profile setup if new
        
        await user.save();
        
        // Remove heavy profilePic before sending
        const userLite = user.toObject();
        delete userLite.profilePic; 
        
        res.json({ success: true, nextStep, user: userLite });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ success: false }); 
    }
});

// 3. Password Login
app.post('/api/v9/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(400).json({ success: false, message: "User not found" });

        const isValid = await user.validatePassword(password);
        if (!isValid) return res.status(400).json({ success: false, message: "Invalid Password" });
        
        const userLite = user.toObject();
        delete userLite.profilePic; 
        
        res.json({ success: true, user: userLite });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- B. ONBOARDING ---
app.post('/api/v9/onboarding/personal', async (req, res) => {
    try {
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 4 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- C. V12 FEATURES (Reports & Lookup) ---
app.get('/api/v12/lookup/:number', async (req, res) => {
    const num = req.params.number;
    
    // 1. Directory Check
    const verified = await DirectoryEntry.findOne({ phoneNumber: num });
    if (verified) return res.json({ status: 'verified', msg: "Verified Enterprise", data: verified });

    // 2. Spam Check
    const suspect = await SuspiciousNumber.findOne({ phoneNumber: num });
    if (suspect && suspect.reportCount >= 10) return res.json({ status: 'danger', reports: suspect.reportCount });

    res.json({ status: 'unknown' });
});

app.post('/api/v12/report', async (req, res) => {
    try {
        const { reportedNumber } = req.body;
        await new SpamReport(req.body).save();
        
        // Aggregation
        const count = await SpamReport.countDocuments({ reportedNumber });
        await SuspiciousNumber.findOneAndUpdate(
            { phoneNumber: reportedNumber },
            { reportCount: count, status: count >= 10 ? 'Blocked' : 'Warning' },
            { upsert: true }
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.get('/api/v12/directory/search', async (req, res) => {
    const regex = new RegExp(req.query.q, 'i');
    res.json(await DirectoryEntry.find({ $or: [{ companyName: regex }, { category: regex }] }).limit(20));
});

// --- GUARDIAN FEATURES ---
app.post('/api/v12/guardian/invite/generate', async (req, res) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { inviteCode: code });
    res.json({ success: true, code });
});

app.post('/api/v9/guardian/join', async (req, res) => {
    const { myPhone, inviteCode } = req.body;
    const target = await User.findOne({ inviteCode });
    const me = await User.findOne({ phoneNumber: myPhone });
    
    if(!target) return res.status(404).json({message: "Invalid Code"});
    
    // Mutual Add
    if(!me.circle.some(c=>c.phone===target.phoneNumber)) me.circle.push({phone:target.phoneNumber, name:target.fullName});
    if(!target.circle.some(c=>c.phone===me.phoneNumber)) target.circle.push({phone:me.phoneNumber, name:me.fullName});
    
    await me.save(); await target.save();
    res.json({ success: true, targetName: target.fullName });
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    const me = await User.findOne({ phoneNumber: req.query.phone });
    if (!me) return res.json({ circle: [] });
    const phones = me.circle.map(c => c.phone);
    const members = await User.find({ phoneNumber: { $in: phones } }).select('fullName phoneNumber location profilePic batteryLevel');
    
    const data = members.map(u => ({
        name: u.fullName, phone: u.phoneNumber, 
        lat: u.location?.lat, lng: u.location?.lng, 
        pic: u.profilePic, battery: u.batteryLevel
    }));
    res.json({ success: true, circle: data, myCode: me.inviteCode });
});

// --- SERVE FRONTEND ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public.html')); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V12.1 Server Running on Port ${PORT}`); });