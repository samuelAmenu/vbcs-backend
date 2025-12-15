/* ==================================================
   VBCS MASTER SERVER V12.23 (ANTI-CRASH + LOGGING)
   - Fixed: 503 Service Unavailable / 502 Bad Gateway
   - Feature: Zero-Copy Stream (Saves Memory)
   - Feature: Debug Logging
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

// --- 1. RAM STORAGE (NO DISK WRITE) ---
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit
}); 

// --- 2. CORS & HEADERS ---
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname)); 

// --- 3. DATABASE ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ DB Connected'))
  .catch(err => console.error('❌ DB Fail:', err.message));

// ==========================================
// SCHEMAS
// ==========================================
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true }, 
    passwordHash: String, salt: String, role: { type: String, default: 'subscriber' }, 
    fullName: String, companyName: String, email: String, profilePic: String, 
    circle: [{ phone: String, name: String }], status: { type: String, default: 'Safe' },
    location: { lat: Number, lng: Number }, batteryLevel: { type: Number, default: 100 },
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
const User = mongoose.models.User || mongoose.model('User', userSchema);

const adminSchema = new mongoose.Schema({ username: String, passwordHash: String, salt: String });
adminSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};
adminSchema.methods.validatePassword = function(password) {
    if (!this.passwordHash || !this.salt) return false;
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

// Admin Auto-Init
(async () => {
    try {
        const admin = await Admin.findOne({ username: 'admin' });
        if (!admin) {
            const newAdmin = new Admin({ username: 'admin' });
            newAdmin.setPassword('admin123');
            await newAdmin.save();
            console.log("🔒 Admin Created");
        }
    } catch(e) {}
})();

const DirectoryEntry = mongoose.models.DirectoryEntry || mongoose.model('DirectoryEntry', new mongoose.Schema({
    companyName: String, phoneNumber: String, category: String, status: { type: String, default: 'Active' }
}));
const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({
    title: String, body: String, date: { type: Date, default: Date.now }
}));
const SpamReport = mongoose.models.SpamReport || mongoose.model('SpamReport', new mongoose.Schema({
    reportedNumber: String, reason: String, comments: String, createdAt: { type: Date, default: Date.now }
}));
const SuspiciousNumber = mongoose.models.SuspiciousNumber || mongoose.model('SuspiciousNumber', new mongoose.Schema({
    phoneNumber: String, reportCount: { type: Number, default: 0 }, status: { type: String, default: 'Warning' }
}));

const io = new Server(server, { cors: { origin: "*" } }); 

// ==========================================
// ROUTES
// ==========================================
const ownerRouter = express.Router();

ownerRouter.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !admin.validatePassword(password)) return res.json({ success: false });
    res.json({ success: true, token: 'session_token' });
});

ownerRouter.get('/stats', async (req, res) => {
    try {
        const b2c = await User.countDocuments({ role: 'subscriber' });
        const b2b = await User.countDocuments({ role: 'enterprise' });
        res.json({ totalMonthlyRevenue: b2c*50 + b2b*500, totalEnterprises: b2b, totalB2CSubscribers: b2c });
    } catch(e) { res.json({}); }
});

ownerRouter.get('/directory', async (req, res) => {
    const list = await DirectoryEntry.find().sort({ companyName: 1 });
    res.json(list);
});

// --- CRASH-PROOF UPLOAD ROUTE ---
ownerRouter.post('/directory-upload', upload.single('file'), (req, res) => {
    console.log("📂 Upload Request Received..."); // DEBUG LOG
    
    if(!req.file) {
        console.error("❌ No file attached");
        return res.status(400).json({ message: "No file found" });
    }

    try {
        // Safe Stream Creation (Efficient Memory Usage)
        const stream = new Readable();
        stream.push(req.file.buffer);
        stream.push(null);

        const results = [];
        stream
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                console.log(`📊 Parsed ${results.length} rows. Saving...`);
                try {
                    const entries = results.map(row => ({
                        companyName: row.Name || row.companyName || 'Unknown',
                        phoneNumber: row.Phone || row.phoneNumber || '000',
                        category: row.Category || row.category || 'Other'
                    }));
                    
                    if(entries.length === 0) return res.json({ success: false, message: "CSV Empty" });

                    // Batch Insert (ordered: false prevents crash on duplicates)
                    await DirectoryEntry.insertMany(entries, { ordered: false });
                    
                    console.log("✅ Save Success!");
                    res.json({ success: true, message: `Imported ${entries.length} items` });
                } catch (e) {
                    if (e.writeErrors) {
                        console.warn("⚠️ Some duplicates skipped.");
                        res.json({ success: true, message: `Imported items (skipped duplicates)` });
                    } else {
                        console.error("❌ DB Error:", e);
                        res.status(500).json({ message: "DB Error" });
                    }
                }
            })
            .on('error', (err) => {
                console.error("❌ CSV Error:", err);
                res.status(400).json({ message: "Bad CSV File" });
            });
    } catch(err) {
        console.error("❌ CRITICAL CRASH:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

// --- BROADCAST & FRAUD ---
ownerRouter.post('/broadcast', async (req, res) => {
    await Notification.create(req.body);
    io.emit('global_alert', req.body); 
    res.json({ success: true });
});
ownerRouter.get('/fraud-reports', async (req, res) => {
    const r = await SpamReport.find().limit(50);
    res.json(r.map(x => ({ number: x.reportedNumber, reason: x.reason })));
});
ownerRouter.post('/suspend-number', async (req, res) => {
    await SuspiciousNumber.findOneAndUpdate({ phoneNumber: req.body.number }, { status: 'Blocked', reportCount: 999 }, { upsert: true });
    res.json({ success: true });
});

app.use('/api/v1/owner', ownerRouter);

// --- LEGACY ROUTES (Placeholder for completeness) ---
app.post('/api/v9/auth/otp-request', (req, res) => res.json({ success: true, testCode: "123456" }));
app.post('/api/v9/auth/login', (req, res) => res.json({ success: true }));

// --- FRONTEND ---
app.get('/', (req, res) => {
    if(fs.existsSync(path.join(__dirname, 'public.html'))) res.sendFile(path.join(__dirname, 'public.html'));
    else res.send("VBCS V12.23 Live");
});
app.get('/admin', (req, res) => {
    if(fs.existsSync(path.join(__dirname, 'admin.html'))) res.sendFile(path.join(__dirname, 'admin.html'));
    else res.status(404).send("Admin file missing");
});

// --- GLOBAL ERROR HANDLER (Catches Multer Errors) ---
app.use((err, req, res, next) => {
    console.error("🔥 Global Error:", err.message);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: "File Upload Error: " + err.message });
    }
    res.status(500).send("Internal Server Error");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 V12.23 Server Running on Port ${PORT}`));