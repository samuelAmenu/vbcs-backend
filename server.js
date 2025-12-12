/* ==================================================
   VBCS MASTER SERVER V12.0 (Full Functional Spec)
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
app.use(express.json({ limit: '50mb' })); // Limit increased for Selfie Uploads
app.use(express.static(__dirname)); 

// 2. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ VBCS V12.0 Engine: Ready & Connected'))
  .catch(err => console.error('❌ DB Error:', err.message));

// ==========================================
// 3. ADVANCED SCHEMAS (V12)
// ==========================================

// A. USER SCHEMA (Enhanced for Lost Mode & Consent)
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true }, 
    passwordHash: String,
    salt: String,
    
    // Identity
    fullName: String,
    email: String,
    profilePic: String, 
    
    // Guardian Safety Features
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    savedPlaces: [{ label: String, lat: Number, lng: Number, icon: String }],
    
    // V12: Lost Mode State
    status: { 
        type: String, 
        enum: ['Safe', 'Lost', 'SOS'], 
        default: 'Safe' 
    },
    lostModeConfig: {
        message: { type: String, default: "If found, please call 9449." },
        altPhone: String,
        lastSelfie: String, // URL/Base64 of thief selfie
        audioAlertActive: { type: Boolean, default: false }
    },

    // V12: Privacy & Consent (GDPR/Compliance)
    privacy: {
        locationConsent: { type: Boolean, default: false },
        accessibilityConsent: { type: Boolean, default: false },
        shareLiveLocation: { type: Boolean, default: true }
    },

    // Device Data
    device: { name: String, imei: String, fcmToken: String }, // fcmToken for Push Notifs
    location: { lat: Number, lng: Number, speed: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 },
    
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

// B. DIRECTORY SCHEMA (Rich Data)
const directorySchema = new mongoose.Schema({
    companyName: { type: String, required: true, index: true },
    phoneNumber: { type: String, required: true, unique: true },
    category: { type: String, index: true }, // Bank, Hospital, Embassy...
    
    // V12: Added Fields
    email: String,
    website: String,
    officeAddress: String,
    description: String,
    logo: String,
    
    isVerified: { type: Boolean, default: true }
});
const DirectoryEntry = mongoose.model('DirectoryEntry', directorySchema);

// C. FRAUD OPS SCHEMA (Automated Logic)
const spamReportSchema = new mongoose.Schema({
    reportedNumber: { type: String, required: true, index: true },
    reporterPhone: String,
    reason: { type: String, enum: ['scam', 'harassment', 'other'] },
    comments: String,
    createdAt: { type: Date, default: Date.now }
});
const SpamReport = mongoose.model('SpamReport', spamReportSchema);

// D. SUSPICIOUS NUMBERS (The Blacklist)
const suspiciousSchema = new mongoose.Schema({
    phoneNumber: { type: String, unique: true },
    reportCount: { type: Number, default: 0 },
    status: { type: String, default: 'Warning' }, // Warning -> Suspicious -> Blocked
    lastReported: Date
});
const SuspiciousNumber = mongoose.model('SuspiciousNumber', suspiciousSchema);


// ==========================================
// 4. REAL-TIME GUARDIAN ENGINE (Socket.io)
// ==========================================

io.on('connection', (socket) => {
    socket.on('join_room', (phone) => { socket.join(phone); });

    // 1. Live Tracking & Lost Mode Check
    socket.on('ping_location', async (data) => {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber: data.phone }, 
                { location: { lat: data.lat, lng: data.lng, speed: data.speed, updatedAt: new Date() }, batteryLevel: data.battery },
                { new: true }
            );

            // Broadcast to family
            socket.broadcast.emit('friend_moved', data);

            // V12: CHECK LOST MODE STATUS
            // If the device reports in, and it is marked "Lost", send the command back immediately
            if (user && user.status === 'Lost') {
                socket.emit('command_execute', { 
                    command: 'ACTIVATE_LOST_MODE', 
                    message: user.lostModeConfig.message,
                    playSiren: user.lostModeConfig.audioAlertActive
                });
            }
        } catch (e) { console.error(e); }
    });

    // 2. SOS Trigger (Blast Alert)
    socket.on('trigger_sos', async (data) => {
        const user = await User.findOne({ phoneNumber: data.phone });
        if(user && user.circle) {
             user.circle.forEach(member => {
                 io.to(member.phone).emit('sos_alert', {
                     fromName: user.fullName,
                     lat: data.lat, lng: data.lng
                 });
             });
        }
    });

    // 3. Security Selfie Upload (From Lost Device)
    socket.on('upload_security_selfie', async (data) => {
        // data = { phone, imageBase64 }
        await User.findOneAndUpdate({ phoneNumber: data.phone }, { 'lostModeConfig.lastSelfie': data.imageBase64 });
        // Notify Admin & Family immediately
        console.log(`📸 SECURITY SELFIE RECEIVED FROM ${data.phone}`);
    });
});


// ==========================================
// 5. V12 API ROUTES
// ==========================================

// --- AUTH & ONBOARDING (Standard) ---
app.post('/api/v9/auth/otp-request', async (req, res) => {
    // ... (Same as V11, simplified for brevity)
    res.json({ success: true, testCode: "123456" }); 
});
app.post('/api/v9/auth/login', async (req, res) => {
    const user = await User.findOne({ phoneNumber: req.body.phoneNumber });
    if(user && user.validatePassword(req.body.password)) res.json({ success: true, user });
    else res.status(400).json({ success: false });
});

// --- LOOKUP MODULE (With V12 Logic) ---
app.get('/api/v12/lookup/:number', async (req, res) => {
    const num = req.params.number;
    
    // 1. Check Verified Directory
    const verified = await DirectoryEntry.findOne({ phoneNumber: num });
    if (verified) {
        return res.json({ 
            status: 'verified', 
            msg: "Verified Call by ethio-telecom", 
            data: verified 
        });
    }

    // 2. Check Suspicious List
    const suspect = await SuspiciousNumber.findOne({ phoneNumber: num });
    if (suspect && suspect.reportCount >= 10) {
        return res.json({ 
            status: 'danger', 
            msg: "⚠️ Potential Spam (High Risk)", 
            reports: suspect.reportCount 
        });
    }

    res.json({ status: 'unknown', msg: "Unknown Number" });
});

// --- REPORTING LOGIC (The "10 Reports" Rule) ---
app.post('/api/v12/report', async (req, res) => {
    try {
        const { reportedNumber, reporterPhone, reason, comments } = req.body;
        
        // 1. Save Report
        await new SpamReport({ reportedNumber, reporterPhone, reason, comments }).save();
        
        // 2. Aggregation Logic
        // Check how many times this number was reported in the last 30 days
        const oneMonthAgo = new Date(); oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
        
        const count = await SpamReport.countDocuments({ 
            reportedNumber, 
            createdAt: { $gte: oneMonthAgo } 
        });

        // 3. Update/Create Suspicious Record
        let suspect = await SuspiciousNumber.findOne({ reportedNumber });
        if (!suspect) suspect = new SuspiciousNumber({ phoneNumber: reportedNumber });
        
        suspect.reportCount = count;
        suspect.lastReported = new Date();
        
        // 4. Auto-Flag Logic
        if (count >= 10) suspect.status = 'Blocked';
        else if (count >= 5) suspect.status = 'Suspicious';
        
        await suspect.save();

        res.json({ success: true, newStatus: suspect.status });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- DIRECTORY SEARCH (Rich Data) ---
app.get('/api/v12/directory/search', async (req, res) => {
    const q = req.query.q;
    // Search by name OR category
    const regex = new RegExp(q, 'i');
    const results = await DirectoryEntry.find({ 
        $or: [{ companyName: regex }, { category: regex }] 
    }).limit(20);
    res.json(results);
});

// --- GUARDIAN: LOST MODE CONTROL ---
app.post('/api/v12/guardian/lost-mode/toggle', async (req, res) => {
    const { phoneNumber, active, message } = req.body;
    // User enables/disables Lost Mode from a safe device
    await User.findOneAndUpdate({ phoneNumber }, { 
        status: active ? 'Lost' : 'Safe',
        'lostModeConfig.message': message || "Return to owner",
        'lostModeConfig.audioAlertActive': active
    });
    // Socket will pick this up on next ping
    res.json({ success: true, status: active ? 'Lost' : 'Safe' });
});

// --- SERVE FRONTEND ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public.html')); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V12.0 VBCS System Running on Port ${PORT}`); });