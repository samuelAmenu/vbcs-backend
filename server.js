/* ==================================================
   VBCS MASTER SERVER V12.3 (COMPLETE: AUTH, ADMIN & FEATURES)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http'); 
const { Server } = require("socket.io"); 
const crypto = require('crypto'); // Restored for legacy auth

// --- IMPORT THE MODEL ---
// We use the external file because it contains the 'role' field needed for the Dashboard
const User = require('./models/User'); 

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
  .then(() => console.log('✅ VBCS Engine: Ready & Connected'))
  .catch(err => console.error('❌ DB Error:', err.message));


// ==========================================
// 3. LEGACY SCHEMAS (Directory & Reports)
// ==========================================
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
// 4. ROUTES: NEW ADMIN & DASHBOARD SYSTEM
// ==========================================
// This connects the 'userController' logic for Web Dashboard Registration
const userRoutes = require('./routes/userRoutes'); 
app.use('/api/users', userRoutes); 


// ==========================================
// 5. ROUTES: LEGACY AUTHENTICATION (RESTORED)
// ==========================================
// These are the "v9" routes your mobile app uses

// A. Request OTP
app.post('/api/v9/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        
        // Generate Fixed Test Code for Stability: "123456"
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

// B. Verify OTP
app.post('/api/v9/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null; // Clear OTP
        
        // Determine Routing (Legacy logic)
        let nextStep = 'home';
        // Note: onboardingStep might not be in your new model, but safe to check
        if ((user.onboardingStep || 0) < 2 && !user.fullName) nextStep = 'wizard'; 
        
        await user.save();
        
        const userLite = user.toObject();
        delete userLite.profilePic; 
        delete userLite.password; // Security best practice
        
        res.json({ success: true, nextStep, user: userLite });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ success: false }); 
    }
});

// C. Password Login (Legacy)
app.post('/api/v9/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(400).json({ success: false, message: "User not found" });

        // Note: This assumes you are still using the old password check method
        // If you migrate fully to bcrypt, this specific route needs update.
        // For now, we assume simple check or that you will use the new /api/users/login endpoint
        if (user.password !== password) { 
             // Ideally use bcrypt.compare here if passwords are hashed
             return res.status(400).json({ success: false, message: "Invalid Password" });
        }
        
        const userLite = user.toObject();
        delete userLite.profilePic; 
        
        res.json({ success: true, user: userLite });
    } catch (err) { res.status(500).json({ success: false }); }
});


// ==========================================
// 6. FEATURES (Lookup, Reports, Guardian)
// ==========================================

// --- Spam Stats ---
app.get('/api/v12/stats/spam-today', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const count = await SpamReport.countDocuments({ createdAt: { $gte: startOfDay } });
        res.json({ count });
    } catch(e) { res.json({ count: 0 }); }
});

// --- Lookup ---
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

// --- Report ---
app.post('/api/v12/report', async (req, res) => {
    try {
        const { reportedNumber } = req.body;
        await new SpamReport(req.body).save();
        
        const count = await SpamReport.countDocuments({ reportedNumber });
        await SuspiciousNumber.findOneAndUpdate(
            { phoneNumber: reportedNumber },
            { reportCount: count, status: count >= 10 ? 'Blocked' : 'Warning' },
            { upsert: true }
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- Directory Search ---
app.get('/api/v12/directory/search', async (req, res) => {
    const regex = new RegExp(req.query.q, 'i');
    res.json(await DirectoryEntry.find({ $or: [{ companyName: regex }, { category: regex }] }).limit(20));
});

// --- Guardian Features (Using New Model) ---
app.post('/api/v12/guardian/invite/generate', async (req, res) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { otp: code }); 
    res.json({ success: true, code });
});

app.post('/api/v9/guardian/join', async (req, res) => {
    const { myPhone, inviteCode } = req.body;
    const target = await User.findOne({ otp: inviteCode }); // Assuming OTP field used for invite code
    const me = await User.findOne({ phoneNumber: myPhone });
    
    if(!target) return res.status(404).json({message: "Invalid Code"});
    
    // Mutual Add logic adapted for 'familyMembers'
    // Note: This logic assumes 'familyMembers' exists on schema
    if (me.familyMembers && target.familyMembers) {
         me.familyMembers.push({ phone: target.phoneNumber, name: target.fullName, status: 'Active' });
         target.familyMembers.push({ phone: me.phoneNumber, name: me.fullName, status: 'Active' });
         await me.save(); await target.save();
    }
    
    res.json({ success: true, targetName: target.fullName });
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    const me = await User.findOne({ phoneNumber: req.query.phone });
    if (!me || !me.familyMembers) return res.json({ circle: [] });
    
    const phones = me.familyMembers.map(c => c.phone);
    const members = await User.find({ phoneNumber: { $in: phones } }).select('fullName phoneNumber location profilePic batteryLevel');
    
    const data = members.map(u => ({
        name: u.fullName, phone: u.phoneNumber, 
        lat: u.location?.lat, lng: u.location?.lng, 
        pic: u.profilePic, battery: u.batteryLevel // Kept batteryLevel
    }));
    res.json({ success: true, circle: data });
});


// ==========================================
// 7. REAL-TIME ENGINE (Socket.io)
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
                // Assuming lostModeConfig might be missing in new schema, add safe check
                const msg = user.lostModeConfig ? user.lostModeConfig.message : "Lost Mode Active";
                const siren = user.lostModeConfig ? user.lostModeConfig.audioAlertActive : false;
                
                socket.emit('command_execute', { 
                    command: 'ACTIVATE_LOST_MODE', 
                    message: msg,
                    playSiren: siren
                });
            }
        } catch (e) { console.error(e); }
    });

    socket.on('trigger_sos', async (data) => {
        const user = await User.findOne({ phoneNumber: data.phone });
        if(user && user.familyMembers) { 
             user.familyMembers.forEach(member => {
                 io.to(member.phone).emit('sos_alert', { fromName: user.fullName, lat: data.lat, lng: data.lng });
             });
        }
    });
});

// --- SERVE FRONTEND ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public.html')); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V12.3 Server Running on Port ${PORT}`); });