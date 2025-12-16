/* ==================================================
   VBCS MASTER SERVER V12.32 (CATEGORY HUB COMPLETE)
   - Added: Dynamic Category Counts (e.g. "Bank (5)")
   - Added: Category Drill-Down Endpoint
   - Feature: Caller ID checks Directory List
   - Base: Full Legacy Code + Smart Upload
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 
const crypto = require('crypto');
const path = require('path');
const http = require('http'); 
const { Server } = require("socket.io"); 
const multer = require('multer');       
const csv = require('csv-parser');      
const fs = require('fs');               
const { Readable } = require('stream'); 

const app = express();
const server = http.createServer(app); 

// --- FIX: USE MEMORY STORAGE (No Disk Access) ---
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } 
}); 

// --- CORS ---
app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

const io = new Server(server, { cors: { origin: "*" } }); 

// MIDDLEWARE
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname)); 

// DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

mongoose.connect(MONGO_URI)
  .then(() => {
      console.log('✅ VBCS Engine: Ready & Connected');
      initAdmin(); 
  })
  .catch(err => console.error('❌ DB Error:', err.message));

// ==========================================
// SCHEMAS
// ==========================================

// A. USER
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true }, 
    passwordHash: String,
    salt: String,
    role: { type: String, enum: ['subscriber', 'enterprise'], default: 'subscriber' }, 
    companyName: String, 
    fullName: String,
    email: String,
    profilePic: String, 
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    savedPlaces: [{ label: String, lat: Number, lng: Number, icon: String }],
    status: { type: String, enum: ['Safe', 'Lost', 'SOS'], default: 'Safe' },
    lostModeConfig: {
        message: { type: String, default: "If found, please call 9449." },
        audioAlertActive: { type: Boolean, default: false }
    },
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    location: { lat: Number, lng: Number, speed: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 }
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
const User = mongoose.models.User || mongoose.model('User', userSchema);

// B. ADMIN
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String
});
adminSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};
adminSchema.methods.validatePassword = function(password) {
    if(!this.salt || !this.passwordHash) return false; 
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

// --- INIT ADMIN ---
async function initAdmin() {
    try {
        const admin = await Admin.findOne({ username: 'admin' });
        
        // Case 1: No Admin -> Create it
        if (!admin) {
            const newAdmin = new Admin({ username: 'admin' });
            newAdmin.setPassword('admin123');
            await newAdmin.save();
            console.log("🔒 Default Admin Created");
        } 
        // Case 2: Broken Admin (Missing Salt) -> Recreate it
        else if (!admin.salt || !admin.passwordHash) {
            console.log("⚠️ Found corrupted Admin. Recreating...");
            await Admin.deleteOne({ username: 'admin' });
            const newAdmin = new Admin({ username: 'admin' });
            newAdmin.setPassword('admin123');
            await newAdmin.save();
            console.log("🔒 Admin account repaired.");
        }
    } catch (e) { console.error("Admin Init Error:", e.message); }
}

// C. OTHERS
const DirectoryEntry = mongoose.models.DirectoryEntry || mongoose.model('DirectoryEntry', new mongoose.Schema({
    companyName: String, phoneNumber: String, category: String, 
    email: String, officeAddress: String, isVerified: { type: Boolean, default: true },
    status: { type: String, default: 'Active' }
}));

const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
    name: { type: String, unique: true }
}));

const SpamReport = mongoose.models.SpamReport || mongoose.model('SpamReport', new mongoose.Schema({
    reportedNumber: String, reporterPhone: String, reason: String, comments: String, createdAt: { type: Date, default: Date.now }
}));

const SuspiciousNumber = mongoose.models.SuspiciousNumber || mongoose.model('SuspiciousNumber', new mongoose.Schema({
    phoneNumber: String, reportCount: { type: Number, default: 0 }, status: { type: String, default: 'Warning' }
}));

const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({
    title: String, body: String, date: { type: Date, default: Date.now }
}));

// ==========================================
// REAL-TIME ENGINE
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
// LEGACY API ROUTES (MOBILE APP - v9)
// ==========================================
app.post('/api/v9/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        const otp = "123456"; 
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000); 
        await user.save();
        res.json({ success: true, testCode: otp }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/v9/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        user.otp = null; 
        let nextStep = 'home';
        if (user.onboardingStep < 2 && !user.fullName) nextStep = 'wizard'; 
        await user.save();
        const userLite = user.toObject();
        delete userLite.profilePic; 
        res.json({ success: true, nextStep, user: userLite });
    } catch (err) { res.status(500).json({ success: false }); }
});

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

app.post('/api/v9/onboarding/personal', async (req, res) => {
    try {
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 4 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

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
        name: u.fullName, phone: u.phoneNumber, lat: u.location?.lat, lng: u.location?.lng, pic: u.profilePic, battery: u.batteryLevel
    }));
    res.json({ success: true, circle: data, myCode: me.inviteCode });
});

// --- CORE ROUTES (v12) ---
app.get('/api/v12/lookup/:number', async (req, res) => {
    const num = req.params.number;
    const verified = await DirectoryEntry.findOne({ phoneNumber: num });
    if (verified) return res.json({ status: 'verified', msg: "Verified Enterprise", data: verified });
    
    const suspect = await SuspiciousNumber.findOne({ phoneNumber: num });
    if (suspect && suspect.reportCount >= 10) return res.json({ status: 'danger', reports: suspect.reportCount });
    
    res.json({ status: 'unknown' });
});

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

// --- NEW: SMART CATEGORIES (COUNTS & GROUPS) ---
app.get('/api/v12/categories', async (req, res) => {
    try {
        // Groups unique categories and counts them
        const stats = await DirectoryEntry.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { _id: 1 } } 
        ]);
        
        const result = stats.map(s => ({ name: s._id || "Other", count: s.count }));
        
        if(result.length === 0) return res.json([{name: "Directory Empty", count: 0}]);
        res.json(result);
    } catch (e) {
        // Fallback if aggregation fails
        res.json([{name: "Bank", count:0}, {name: "Emergency", count:0}]);
    }
});

// --- NEW: CATEGORY DRILL-DOWN (LIST BY CAT) ---
app.get('/api/v12/directory/category/:name', async (req, res) => {
    try {
        const list = await DirectoryEntry.find({ 
            category: { $regex: new RegExp("^" + req.params.name + "$", "i") } 
        }).sort({ companyName: 1 });
        res.json(list);
    } catch (e) { res.json([]); }
});

// --- UPDATED: SEARCH FIX (With Category Filter) ---
app.get('/api/v12/directory/search', async (req, res) => {
    try {
        const { q, category } = req.query;
        let query = {};

        if (category && category !== 'All') {
            query.category = { $regex: new RegExp("^" + category + "$", "i") }; 
        }

        if (q && q.trim() !== "") {
            const regex = new RegExp(q, 'i');
            query.$or = [
                { companyName: regex },
                { phoneNumber: regex }
            ];
        }

        const results = await DirectoryEntry.find(query).limit(50);
        res.json(results);
    } catch (e) { res.json([]); }
});

// ==========================================
// 7. OWNER / ADMIN ROUTES (V1)
// ==========================================
const ownerRouter = express.Router();

ownerRouter.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !admin.validatePassword(password)) {
        return res.status(401).json({ success: false, message: "Invalid Credentials" });
    }
    res.json({ success: true, token: 'session_token' });
});

ownerRouter.post('/change-password', async (req, res) => {
    const { username, newPassword } = req.body;
    const admin = await Admin.findOne({ username });
    if (admin) {
        admin.setPassword(newPassword);
        await admin.save();
        res.json({ success: true, message: "Password Updated" });
    } else {
        res.status(404).json({ success: false, message: "Admin not found" });
    }
});

ownerRouter.get('/stats', async (req, res) => {
    try {
        const b2c = await User.countDocuments({ role: 'subscriber' });
        const b2b = await User.countDocuments({ role: 'enterprise' });
        const reports = await SpamReport.countDocuments();
        res.json({ 
            totalMonthlyRevenue: b2c * 50 + b2b * 500, 
            totalEnterprises: b2b, 
            totalB2CSubscribers: b2c, 
            spamReports: reports 
        });
    } catch(e) { res.json({ success: false }); }
});

ownerRouter.get('/subscribers/:type', async (req, res) => {
    try {
        const role = req.params.type === 'b2b' ? 'enterprise' : 'subscriber';
        if (mongoose.connection.readyState !== 1) {
            return res.json([]); 
        }
        const users = await User.find({ role }).sort({ createdAt: -1 }).limit(100);
        res.json(users || []); 
    } catch (e) {
        console.error("Fetch Error:", e);
        res.json([]); 
    }
});

ownerRouter.get('/directory', async (req, res) => {
    const list = await DirectoryEntry.find().sort({ companyName: 1 });
    res.json(list);
});

// --- CSV UPLOAD (SMART RAM MODE) ---
ownerRouter.post('/directory-upload', upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({ message: "No file found" });
    
    const stream = Readable.from(req.file.buffer.toString('utf8'));
    let entries = [];

    stream
        .pipe(csv())
        .on('data', (row) => {
            const rowKeys = Object.keys(row);
            const findVal = (possibleNames) => {
                for (const name of possibleNames) {
                    const foundKey = rowKeys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === name);
                    if (foundKey && row[foundKey]) return row[foundKey];
                }
                return null;
            };

            const name = findVal(['company', 'companyname', 'name', 'business', 'title']);
            const phone = findVal(['phone', 'phonenumber', 'mobile', 'contact', 'tel']);
            const cat = findVal(['category', 'type', 'industry', 'sector']) || 'Other';

            if (phone) {
                entries.push({
                    companyName: name || 'Unknown',
                    phoneNumber: phone,
                    category: cat
                });
            }
        })
        .on('end', async () => {
            try {
                if(entries.length === 0) return res.json({ success: false, message: "No valid Phone/Name columns found in CSV" });

                await DirectoryEntry.insertMany(entries, { ordered: false });
                res.json({ success: true, message: `Imported ${entries.length} items` });
            } catch (e) {
                if (e.writeErrors) {
                    const inserted = entries.length - e.writeErrors.length;
                    res.json({ success: true, message: `Imported ${inserted} items. (Skipped duplicates)` });
                } else {
                    console.error("DB Error:", e);
                    res.status(500).json({ message: "Database Error" });
                }
            }
        })
        .on('error', (err) => {
            console.error("CSV Parse Error:", err);
            res.status(400).json({ message: "Invalid CSV file." });
        });
});

ownerRouter.post('/broadcast', async (req, res) => {
    const { title, body } = req.body;
    await Notification.create({ title, body });
    io.emit('global_alert', { title, body }); 
    res.json({ success: true });
});

ownerRouter.get('/fraud-reports', async (req, res) => {
    const reports = await SpamReport.find().sort({ createdAt: -1 }).limit(50);
    const mapped = reports.map(r => ({
        number: r.reportedNumber || r.phoneNumber,
        reportedNumber: r.reportedNumber || r.phoneNumber,
        reason: r.reason,
        comments: r.comments,
        createdAt: r.createdAt
    }));
    res.json(mapped);
});

ownerRouter.post('/suspend-number', async (req, res) => {
    const { number } = req.body;
    await SuspiciousNumber.findOneAndUpdate(
        { phoneNumber: number },
        { status: 'Blocked', reportCount: 999 },
        { upsert: true }
    );
    res.json({ success: true });
});

app.use('/api/v1/owner', ownerRouter);

// ==========================================
// 8. SERVE FRONTEND (AND 404 CATCH-ALL)
// ==========================================
app.get('/', (req, res) => { 
    if (fs.existsSync(path.join(__dirname, 'public.html'))) {
        res.sendFile(path.join(__dirname, 'public.html'));
    } else {
        res.send("<h1>Server is Running (public.html missing)</h1>");
    }
});

app.get('/admin', (req, res) => { 
    if (fs.existsSync(path.join(__dirname, 'admin.html'))) {
        res.sendFile(path.join(__dirname, 'admin.html')); 
    } else {
        res.status(404).send("<h1>Admin Panel Not Found</h1><p>Please make sure admin.html is in the root folder.</p>");
    }
});

// Catch-All for unknown routes
app.get('*', (req, res) => {
    res.status(404).send("<h1>404 Not Found</h1>");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V12.32 Server Running on Port ${PORT}`); });