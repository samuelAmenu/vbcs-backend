/* ==================================================
   VBCS MASTER SERVER V11.0 (Guardian Engine)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const http = require('http'); 
const { Server } = require("socket.io"); 
const axios = require('axios'); 

const app = express();
const server = http.createServer(app); 
const io = new Server(server, { cors: { origin: "*" } }); 

// 1. MIDDLEWARE
app.use(cors()); 
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname)); 

// 2. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to Database...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected (V11 Guardian Engine Ready)'))
  .catch(err => console.error('❌ DB Error:', err.message));

// ==========================================
// 3. ENHANCED SCHEMAS (V11)
// ==========================================

const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true }, 
    passwordHash: String,
    salt: String,
    
    // Profile
    fullName: String,
    email: String,
    age: Number,
    secondaryPhone: String,
    profilePic: String, 
    
    // Guardian Features (NEW)
    inviteCode: { type: String, unique: true },
    inviteCodeExpires: { type: Date }, // Support for 50-min expiry
    
    savedPlaces: [{
        label: { type: String, enum: ['Home', 'Work', 'School', 'Other'], default: 'Other' },
        address: String,
        lat: Number,
        lng: Number,
        icon: { type: String, default: 'fa-map-marker-alt' }
    }],

    subscription: {
        plan: { type: String, default: 'Free' }, // 'Guardian+', 'Family'
        status: { type: String, default: 'Active' },
        nextBillDate: { type: Date, default: () => new Date(+new Date() + 365*24*60*60*1000) } // 1 Year Free
    },

    // Status Data
    device: { name: String, imei: String, type: { type: String, default: 'Mobile' } },
    location: { lat: Number, lng: Number, updatedAt: Date, speed: Number }, // Added Speed
    batteryLevel: { type: Number, default: 100 },
    
    // Social & Safety
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    
    // Auth State
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Async Password Methods
userSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
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

const User = mongoose.model('User', userSchema);
const DirectoryEntry = mongoose.model('DirectoryEntry', new mongoose.Schema({ phoneNumber: String, companyName: String, category: String, status: { type: String, default: 'Verified' } }));
const SpamReport = mongoose.model('SpamReport', new mongoose.Schema({ number: String, reason: String, comments: String, status: { type: String, default: 'Pending' }, createdAt: { type: Date, default: Date.now } }));
const Enterprise = mongoose.model('Enterprise', new mongoose.Schema({ companyName: String, contactPerson: String, phone: String, plan: String, status: { type: String, default: 'Active' }, createdAt: { type: Date, default: Date.now } }));

// ==========================================
// 4. REAL-TIME ENGINE (Socket.io)
// ==========================================

io.on('connection', (socket) => {
    socket.on('join_room', (phoneNumber) => {
        socket.join(phoneNumber);
    });

    // 1. Location Ping
    socket.on('ping_location', async (data) => {
        try {
            // Update DB Async
            User.findOneAndUpdate({ phoneNumber: data.phone }, { 
                location: { lat: data.lat, lng: data.lng, updatedAt: new Date(), speed: data.speed || 0 },
                batteryLevel: data.battery
            }).exec();

            // Broadcast to Circle
            socket.broadcast.emit('friend_moved', data); 
        } catch (e) { console.log(e); }
    });

    // 2. SOS TRIGGER (NEW)
    socket.on('trigger_sos', async (data) => {
        // data = { phone, lat, lng }
        console.log(`🚨 SOS TRIGGERED by ${data.phone}`);
        
        // Find user to get their circle
        const user = await User.findOne({ phoneNumber: data.phone });
        if(user && user.circle) {
             // Notify every member of the circle immediately
             user.circle.forEach(member => {
                 io.to(member.phone).emit('sos_alert', {
                     fromName: user.fullName,
                     fromPhone: user.phoneNumber,
                     lat: data.lat,
                     lng: data.lng,
                     time: new Date()
                 });
             });
        }
    });
});

// ==========================================
// 5. SHARED LOGIC
// ==========================================

const handleOtpRequest = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        
        const otp = crypto.randomInt(100000, 999999).toString();
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000); 
        await user.save();
        
        if (process.env.SMS_API_KEY) {
             console.log(`📡 SMS Sent to ${phoneNumber}`);
        } else {
             console.log(`⚠️ SMS Sim Mode: Code for ${phoneNumber} is ${otp}`);
        }
        res.json({ success: true, testCode: otp });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const handleOtpVerify = async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        
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
        delete userLite.profilePic; 
        res.json({ success: true, user: userLite });
    } catch (err) { res.status(500).json({ success: false }); }
};

// ==========================================
// 6. API ROUTES
// ==========================================

// --- AUTH ---
app.post('/api/v9/auth/otp-request', handleOtpRequest);
app.post('/api/v9/auth/otp-verify', handleOtpVerify);
app.post('/api/v9/auth/login', handleLogin);

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
        await user.setPassword(req.body.password); 
        user.onboardingStep = 4;
        await user.save();
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- GUARDIAN V11 FEATURES ---

// 1. Generate Invite Code (50 Min Expiry)
app.post('/api/v11/guardian/invite/generate', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expires = new Date(Date.now() + 50 * 60000); // 50 Mins
        
        await User.findOneAndUpdate({ phoneNumber }, { inviteCode: code, inviteCodeExpires: expires });
        res.json({ success: true, code, expires });
    } catch(err) { res.status(500).json({ success: false }); }
});

// 2. Join Family (With Expiry Check)
app.post('/api/v9/guardian/join', async (req, res) => {
    try {
        const { myPhone, inviteCode } = req.body;
        const target = await User.findOne({ inviteCode });
        const me = await User.findOne({ phoneNumber: myPhone });
        
        if (!target) return res.status(404).json({ success: false, message: "Code not found" });
        
        // Expiry Check
        if (target.inviteCodeExpires && target.inviteCodeExpires < Date.now()) {
            return res.status(400).json({ success: false, message: "Code Expired" });
        }
        
        // Add to Circle Logic
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

// 3. Saved Locations (Home/Work)
app.post('/api/v11/guardian/places/add', async (req, res) => {
    try {
        // body: { phoneNumber, label: 'Home', lat, lng }
        const { phoneNumber, label, lat, lng } = req.body;
        const icon = label === 'Home' ? 'fa-home' : (label === 'Work' ? 'fa-briefcase' : 'fa-map-marker');
        
        await User.findOneAndUpdate(
            { phoneNumber }, 
            { $push: { savedPlaces: { label, lat, lng, icon } } }
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    try {
        const me = await User.findOne({ phoneNumber: req.query.phone }).select('circle inviteCode inviteCodeExpires');
        if (!me) return res.json({ circle: [] });
        
        const circlePhones = me.circle.map(c => c.phone);
        const members = await User.find({ phoneNumber: { $in: circlePhones } })
                                  .select('fullName phoneNumber location profilePic batteryLevel');

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

// --- TOOLS & ADMIN ---
app.get('/api/v9/lookup/call/:n', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.n }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unverified' }); });
app.get('/api/v9/lookup/sms/:s', async (req, res) => { const d = await DirectoryEntry.findOne({ phoneNumber: req.params.s }); res.json(d ? { status: 'verified', name: d.companyName } : { status: 'unknown' }); });
app.get('/api/v9/lookup/directory', async (req, res) => { res.json(await DirectoryEntry.find().limit(50)); });
app.post('/api/v9/reports', async (req, res) => { await new SpamReport(req.body).save(); res.json({ success: true }); });

// --- SERVE FRONTEND ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V11.0 Guardian Engine running on port ${PORT}`); });