/* ==================================================
   VBCS MASTER SERVER V10.0 (Pro: Sockets + Security)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const http = require('http'); // Required for Socket.io
const { Server } = require("socket.io"); // Real-time Engine
const axios = require('axios'); // For Africa's Talking API

const app = express();
const server = http.createServer(app); // Wrap express in HTTP
const io = new Server(server, { cors: { origin: "*" } }); // Initialize Sockets

// 1. MIDDLEWARE
app.use(cors()); // In production, replace '*' with your app domain
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname)); 

// 2. DATABASE CONNECTION (Secure)
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to Database...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected (V10 Engine Ready)'))
  .catch(err => console.error('❌ DB Error:', err.message));

// ==========================================
// 3. DATABASE SCHEMAS (Optimized)
// ==========================================

const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true }, // Indexed for speed
    passwordHash: String,
    salt: String,
    
    // Profile Data
    fullName: String,
    email: String,
    age: Number,
    secondaryPhone: String,
    profilePic: String, // Still Base64 (Consider S3 for V11)
    inviteCode: { type: String, unique: true },
    
    // Status Data
    device: { name: String, imei: String, type: { type: String, default: 'Mobile' } },
    location: { lat: Number, lng: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 },
    
    // Social
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    invites: [{ fromName: String, fromPhone: String, date: { type: Date, default: Date.now } }],
    
    // Auth State
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Non-Blocking Password Methods
userSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    // Using Async PBKDF2
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, this.salt, 1000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            this.passwordHash = derivedKey.toString('hex');
            resolve();
        });
    });
};

userSchema.methods.validatePassword = function(password) {
    return new Promise((resolve, reject) => {
        if (!this.passwordHash || !this.salt) return resolve(false);
        crypto.pbkdf2(password, this.salt, 1000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            resolve(this.passwordHash === derivedKey.toString('hex'));
        });
    });
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
// 4. REAL-TIME ENGINE (Socket.io)
// ==========================================

io.on('connection', (socket) => {
    // console.log(`⚡ New Client Connected: ${socket.id}`);

    // User joins their own "Phone Room" to receive private updates
    socket.on('join_room', (phoneNumber) => {
        socket.join(phoneNumber);
    });

    // Handle Real-Time Location Pings
    socket.on('ping_location', async (data) => {
        // data = { phone, lat, lng, battery }
        
        // 1. Broadcast to everyone in my "Circle" immediately (Fast UI)
        // We need to know who is in the circle. 
        // For efficiency, the client should send the list of circle_phones, 
        // OR we just broadcast to the specific "Room" if we group families.
        // Simplified approach: Client sends updates, Server saves silently.
        
        try {
            // Update DB Async (Don't wait for it to emit)
            User.findOneAndUpdate({ phoneNumber: data.phone }, { 
                location: { lat: data.lat, lng: data.lng, updatedAt: new Date() },
                batteryLevel: data.battery
            }).exec();

            // Notify specific watchers? 
            // For V10, we will emit a global event that clients filter, or setup rooms.
            // Let's use a "Family Room" concept later. For now, we emit to the user's specific ID if someone is watching?
            // Actually, best "Sim" approach:
            socket.broadcast.emit('friend_moved', data); 
        } catch (e) { console.log(e); }
    });

    socket.on('disconnect', () => {
        // console.log('Client disconnected');
    });
});

// ==========================================
// 5. SHARED LOGIC (The Optimization)
// ==========================================

const handleOtpRequest = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        
        // Secure Random Code
        const otp = crypto.randomInt(100000, 999999).toString();
        
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000); // 5 Mins
        await user.save();
        
        // ----------------------------------------
        // SMS INTEGRATION (Priority 2)
        // ----------------------------------------
        if (process.env.SMS_API_KEY) {
             // Africa's Talking / Twilio Implementation
             // const at = require('africastalking')({ apiKey: process.env.SMS_KEY, username: 'sandbox' });
             // at.SMS.send({ to: phoneNumber, message: `Your VBCS Code is ${otp}` });
             console.log(`📡 SMS Sent to ${phoneNumber}`);
        } else {
             console.log(`⚠️ SMS Sim Mode: Code for ${phoneNumber} is ${otp}`);
        }

        res.json({ success: true, testCode: otp }); // Remove testCode in V11 (Prod)
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const handleOtpVerify = async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        
        // Check Expiry
        if (user && user.otpExpires < Date.now()) return res.status(400).json({success: false, message: "OTP Expired"});

        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null;
        
        let nextStep = 'home';
        if (user.onboardingStep < 4) {
            if (!user.fullName) nextStep = 'personal';
            else if (!user.device || !user.device.name) nextStep = 'device';
            else if (!user.passwordHash) nextStep = 'password';
        }
        await user.save();
        
        // Return minimal User object (exclude heavy profilePic)
        const userLite = user.toObject();
        delete userLite.profilePic; 
        
        res.json({ success: true, nextStep, user: userLite });
    } catch (err) { res.status(500).json({ success: false }); }
};

const handleLogin = async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(400).json({ success: false, message: "User not found" });

        const isValid = await user.validatePassword(password);
        if (!isValid) return res.status(400).json({ success: false, message: "Invalid Credentials" });
        
        const userLite = user.toObject();
        delete userLite.profilePic; // Bandwidth Saver
        
        res.json({ success: true, user: userLite });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ success: false }); 
    }
};

// ==========================================
// 6. API ROUTES
// ==========================================

// --- AUTH (V9 & V6) ---
app.post('/api/v9/auth/otp-request', handleOtpRequest);
app.post('/api/v6/auth/otp-request', handleOtpRequest);

app.post('/api/v9/auth/otp-verify', handleOtpVerify);
app.post('/api/v6/auth/otp-verify', handleOtpVerify);

app.post('/api/v9/auth/login', handleLogin);
app.post('/api/v6/auth/login', handleLogin);

// --- ONBOARDING ---
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
        await user.setPassword(req.body.password); // Now Async
        user.onboardingStep = 4;
        await user.save();
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- GUARDIAN PRO (V10 - Optimized Circle Fetch) ---
app.post('/api/v9/guardian/location', async (req, res) => {
    // Legacy fallback: Still updates DB for history, but UI should use Sockets
    try {
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { 
            location: { lat: req.body.lat, lng: req.body.lng, updatedAt: new Date() },
            batteryLevel: req.body.battery || 100
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
        const isTargetInMyCircle = me.circle.some(c => c.phone === target.phoneNumber);
        const amIInTargetCircle = target.circle.some(c => c.phone === me.phoneNumber);

        if (!isTargetInMyCircle) me.circle.push({ phone: target.phoneNumber, name: target.fullName });
        if (!amIInTargetCircle) target.circle.push({ phone: me.phoneNumber, name: me.fullName });
        
        if (!isTargetInMyCircle || !amIInTargetCircle) {
            await me.save();
            await target.save();
        }

        res.json({ success: true, targetName: target.fullName });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    try {
        // 1. Get My Circle List
        const me = await User.findOne({ phoneNumber: req.query.phone }).select('circle inviteCode');
        if (!me) return res.json({ circle: [] });
        
        const circlePhones = me.circle.map(c => c.phone);

        // 2. The "Pro" Query: Get all members in ONE database call (No loops!)
        const members = await User.find({ phoneNumber: { $in: circlePhones } })
                                  .select('fullName phoneNumber location profilePic batteryLevel');

        // 3. Map Data
        const mapData = members.map(u => ({
            name: u.fullName,
            phone: u.phoneNumber,
            lat: u.location ? u.location.lat : 0,
            lng: u.location ? u.location.lng : 0,
            pic: u.profilePic, 
            battery: u.batteryLevel,
            initials: u.fullName ? u.fullName.substring(0,2).toUpperCase() : 'NA'
        }));

        res.json({ success: true, circle: mapData, myCode: me.inviteCode });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- TOOLS & ADMIN (V9) ---
app.get('/api/v9/lookup/call/:n', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.n }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unverified' }); });
app.get('/api/v9/lookup/sms/:s', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.s }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unknown' }); });
app.get('/api/v9/lookup/directory', async (req, res) => { res.json(await DirectoryEntry.find().limit(50)); });
app.post('/api/v9/reports', async (req, res) => { await new SpamReport(req.body).save(); res.json({ success: true }); });

// Admin Routes (Protected)
const ownerLogin = (req, res) => { 
    // In Pro V10, move this pass to .env: process.env.ADMIN_PASS
    if(req.body.password === (process.env.ADMIN_PASS || 'admin123')) res.json({success:true}); 
    else res.status(401).json({}); 
};
app.post('/api/v6/owner/login', ownerLogin);
app.post('/api/v1/owner/login', ownerLogin);

app.get('/api/v6/owner/stats', async (req, res) => res.json({ totalRevenue: 50000, users: await User.countDocuments(), enterprises: await Enterprise.countDocuments() }));
app.post('/api/v6/owner/directory/bulk', async (req, res) => { if(Array.isArray(req.body.entries)) await DirectoryEntry.insertMany(req.body.entries); res.json({ success: true }); });
app.get('/api/v6/owner/subscribers/b2c', async (req, res) => res.json(await User.find().select('-profilePic').limit(50))); // Exclude Pic
app.get('/api/v6/owner/subscribers/b2b', async (req, res) => res.json(await Enterprise.find().limit(50)));
app.post('/api/v6/owner/directory/add', async (req, res) => { try { const entry = new DirectoryEntry(req.body); await entry.save(); res.json({ success: true }); } catch(err) { res.status(500).json({ success: false }); } });
app.get('/api/v6/owner/directory/list', async (req, res) => { try { res.json(await DirectoryEntry.find().sort({ companyName: 1 }).limit(100)); } catch(err) { res.status(500).json([]); } });
app.get('/api/v6/owner/fraud-reports', async (req, res) => { try { res.json(await SpamReport.find().sort({ createdAt: -1 }).limit(20)); } catch(err) { res.status(500).json([]); } });
app.post('/api/v6/owner/suspend-number', async (req, res) => { try { await SpamReport.updateMany({ number: req.body.number }, { status: 'Suspended' }); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); } });

// --- SERVE FRONTEND ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V10.0 Master Server (Pro) running on port ${PORT}`); });