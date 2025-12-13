/* ==================================================
   VBCS MASTER SERVER V12.2 (MERGED & FIXED)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http'); 
const { Server } = require("socket.io"); 

// --- IMPORT THE NEW MODEL ---
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
  .then(() => console.log('✅ VBCS V12.1 Engine: Ready & Connected'))
  .catch(err => console.error('❌ DB Error:', err.message));

// ==========================================
// 3. INTEGRATE NEW AUTH & ADMIN SYSTEM
// ==========================================
// This connects the 'userController' logic we wrote to handle Registration & Admin Dashboard
const userRoutes = require('./routes/userRoutes'); 
app.use('/api/users', userRoutes); 
// New Endpoints:
// POST /api/users/register (New Subscriber)
// POST /api/users/login    (Login)
// GET  /api/users/all      (Admin Dashboard)

// ==========================================
// 4. LEGACY SCHEMAS (Directory & Reports)
// ==========================================
// We kept these here as you requested to preserve functionality

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

// --- V12.2: DASHBOARD STATS ---
app.get('/api/v12/stats/spam-today', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const count = await SpamReport.countDocuments({ 
            createdAt: { $gte: startOfDay } 
        });
        
        res.json({ count });
    } catch(e) { res.json({ count: 0 }); }
});

// ==========================================
// 5. REAL-TIME ENGINE (Socket.io)
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
                    message: user.lostModeConfig?.message || "Lost Mode Active",
                    playSiren: user.lostModeConfig?.audioAlertActive || false
                });
            }
        } catch (e) { console.error(e); }
    });

    socket.on('trigger_sos', async (data) => {
        const user = await User.findOne({ phoneNumber: data.phone });
        if(user && user.familyMembers) { // Updated to match new Model field 'familyMembers'
             user.familyMembers.forEach(member => {
                 io.to(member.phone).emit('sos_alert', { fromName: user.fullName, lat: data.lat, lng: data.lng });
             });
        }
    });
});

// ==========================================
// 6. FEATURES (Lookup, Reports, Guardian)
// ==========================================

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
// Note: These now use the 'User' model imported from models/User.js

app.post('/api/v12/guardian/invite/generate', async (req, res) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    // Using 'otp' field for invite code to save space, or you can add inviteCode to model
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { otp: code }); 
    res.json({ success: true, code });
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    const me = await User.findOne({ phoneNumber: req.query.phone });
    if (!me || !me.familyMembers) return res.json({ circle: [] });
    
    // Adapted logic for new Schema 'familyMembers'
    const phones = me.familyMembers.map(c => c.phone);
    const members = await User.find({ phoneNumber: { $in: phones } }).select('fullName phoneNumber location profilePic');
    
    const data = members.map(u => ({
        name: u.fullName, phone: u.phoneNumber, 
        lat: u.location?.lat, lng: u.location?.lng, 
        pic: u.profilePic
    }));
    res.json({ success: true, circle: data });
});

// --- SERVE FRONTEND ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public.html')); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V12.2 Server Running on Port ${PORT}`); });