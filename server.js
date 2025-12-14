/* ==================================================
   VBCS MASTER SERVER V12.15 (CLOUD-SAFE UPLOAD FIX)
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
const os = require('os'); // NEW: For system temp folder

const app = express();
const server = http.createServer(app); 

// --- FIX: USE SYSTEM TEMP FOLDER ---
// Instead of creating an 'uploads' folder (which Render might block),
// we use the system's temporary directory. This is always writable.
const upload = multer({ dest: os.tmpdir() }); 
// -----------------------------------

// --- CORS SETTINGS ---
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
// SCHEMAS (PRESERVED)
// ==========================================
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true }, 
    passwordHash: String, salt: String,
    role: { type: String, enum: ['subscriber', 'enterprise'], default: 'subscriber' }, 
    companyName: String, fullName: String, email: String, profilePic: String, 
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    savedPlaces: [{ label: String, lat: Number, lng: Number, icon: String }],
    status: { type: String, enum: ['Safe', 'Lost', 'SOS'], default: 'Safe' },
    lostModeConfig: { message: { type: String, default: "If found, please call 9449." }, audioAlertActive: { type: Boolean, default: false } },
    otp: String, otpExpires: Date, onboardingStep: { type: Number, default: 0 },
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

const Admin = mongoose.models.Admin || mongoose.model('Admin', new mongoose.Schema({ username: String, passwordHash: String, salt: String }));
// Add setPassword/validatePassword to Admin schema (simplified here for brevity but logic exists in previous versions)
// ... (Logic is handled inside initAdmin and login route manually if needed, or re-add methods here)
// Re-adding methods for safety:
const adminSchema = Admin.schema;
adminSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};
adminSchema.methods.validatePassword = function(password) {
    if(!this.salt || !this.passwordHash) return false; 
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};

async function initAdmin() {
    const admin = await Admin.findOne({ username: 'admin' });
    if (!admin) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
        await Admin.create({ username: 'admin', salt, passwordHash: hash });
        console.log("🔒 Default Admin Created");
    } else if (!admin.salt) {
        await Admin.deleteOne({ username: 'admin' });
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
        await Admin.create({ username: 'admin', salt, passwordHash: hash });
        console.log("🔒 Admin account repaired.");
    }
}

const DirectoryEntry = mongoose.models.DirectoryEntry || mongoose.model('DirectoryEntry', new mongoose.Schema({
    companyName: String, phoneNumber: String, category: String, 
    email: String, officeAddress: String, isVerified: { type: Boolean, default: true },
    status: { type: String, default: 'Active' }
}));
const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({ name: { type: String, unique: true } }));
const SpamReport = mongoose.models.SpamReport || mongoose.model('SpamReport', new mongoose.Schema({ reportedNumber: String, reason: String, comments: String, createdAt: { type: Date, default: Date.now } }));
const SuspiciousNumber = mongoose.models.SuspiciousNumber || mongoose.model('SuspiciousNumber', new mongoose.Schema({ phoneNumber: String, reportCount: { type: Number, default: 0 }, status: { type: String, default: 'Warning' } }));
const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({ title: String, body: String, date: { type: Date, default: Date.now } }));

// --- SOCKET IO ---
io.on('connection', (socket) => {
    socket.on('join_room', (phone) => { socket.join(phone); });
    socket.on('ping_location', async (data) => {
        try {
            await User.findOneAndUpdate({ phoneNumber: data.phone }, { location: { lat: data.lat, lng: data.lng, updatedAt: new Date() }, batteryLevel: data.battery });
            socket.broadcast.emit('friend_moved', data);
        } catch (e) {}
    });
    socket.on('trigger_sos', async (data) => {
        const user = await User.findOne({ phoneNumber: data.phone });
        if(user && user.circle) user.circle.forEach(m => io.to(m.phone).emit('sos_alert', { fromName: user.fullName, lat: data.lat, lng: data.lng }));
    });
});

// --- API ROUTES ---
app.post('/api/v9/auth/otp-request', async (req, res) => { res.json({ success: true, testCode: "123456" }); });
app.post('/api/v9/auth/otp-verify', async (req, res) => { res.json({ success: true, nextStep: 'home', user: {} }); });
app.post('/api/v9/auth/login', async (req, res) => {
    const { phoneNumber, password } = req.body;
    const user = await User.findOne({ phoneNumber });
    if(user && user.validatePassword(password)) res.json({ success: true, user });
    else res.status(400).json({ success: false });
});

// --- OWNER ROUTES ---
const ownerRouter = express.Router();
ownerRouter.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if(!admin) return res.status(401).json({ success:false });
    const hash = crypto.pbkdf2Sync(password, admin.salt, 1000, 64, 'sha512').toString('hex');
    if(admin.passwordHash === hash) res.json({ success: true, token: 'session_token' });
    else res.status(401).json({ success: false });
});

ownerRouter.get('/stats', async (req, res) => {
    const b2c = await User.countDocuments({ role: 'subscriber' });
    const b2b = await User.countDocuments({ role: 'enterprise' });
    const reports = await SpamReport.countDocuments();
    res.json({ totalMonthlyRevenue: b2c*50 + b2b*500, totalEnterprises: b2b, totalB2CSubscribers: b2c, spamReports: reports });
});

ownerRouter.get('/subscribers/:type', async (req, res) => {
    const role = req.params.type === 'b2b' ? 'enterprise' : 'subscriber';
    res.json(await User.find({ role }).sort({ createdAt: -1 }).limit(100));
});

ownerRouter.get('/categories', async (req, res) => {
    const cats = await Category.find().sort({ name: 1 });
    if(cats.length === 0) {
        const d = ["Bank", "Hotel", "Embassy", "Transport", "Emergency", "Other"];
        await Category.insertMany(d.map(n => ({ name: n })));
        return res.json(d.map(n => ({ name: n })));
    }
    res.json(cats);
});
ownerRouter.post('/categories', async (req, res) => { await Category.create({ name: req.body.name }); res.json({ success: true }); });
ownerRouter.delete('/categories/:name', async (req, res) => { await Category.deleteOne({ name: req.params.name }); res.json({ success: true }); });

ownerRouter.get('/directory', async (req, res) => { res.json(await DirectoryEntry.find().sort({ companyName: 1 })); });
ownerRouter.post('/directory-add', async (req, res) => { await DirectoryEntry.create(req.body); res.json({ success: true }); });

// --- CLOUD SAFE CSV UPLOAD ---
ownerRouter.post('/directory-upload', upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({ message: "No file received" });
    
    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                const entries = results.map(row => ({
                    companyName: row.Name || row.companyName || 'Unknown',
                    phoneNumber: row.Phone || row.phoneNumber || '000',
                    category: row.Category || row.category || 'Other'
                }));
                
                if(entries.length > 0) await DirectoryEntry.insertMany(entries);
                
                // Cleanup
                fs.unlink(req.file.path, (err) => { if(err) console.error("Temp file delete failed", err); });
                
                res.json({ success: true, message: `Imported ${entries.length} items` });
            } catch (e) {
                console.error(e);
                res.status(500).json({ message: "DB Error" });
            }
        })
        .on('error', (err) => {
            console.error("CSV Parse Error:", err);
            res.status(400).json({ message: "File parse error. Use standard CSV." });
        });
});

ownerRouter.post('/broadcast', async (req, res) => {
    await Notification.create(req.body);
    io.emit('global_alert', req.body); 
    res.json({ success: true });
});

ownerRouter.get('/fraud-reports', async (req, res) => {
    const reports = await SpamReport.find().sort({ createdAt: -1 }).limit(50);
    res.json(reports.map(r => ({ reportedNumber: r.reportedNumber || r.phoneNumber, reason: r.reason, comments: r.comments, createdAt: r.createdAt })));
});

ownerRouter.post('/suspend-number', async (req, res) => {
    await SuspiciousNumber.findOneAndUpdate({ phoneNumber: req.body.number }, { status: 'Blocked', reportCount: 999 }, { upsert: true });
    res.json({ success: true });
});

app.use('/api/v1/owner', ownerRouter);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => { console.log(`🚀 V12.15 Cloud Server Running on Port ${PORT}`); });