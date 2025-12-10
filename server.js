/* ==================================================
   VBCS MASTER SERVER (All-in-One)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
// ⚠️ REPLACE THE PASSWORD BELOW. DO NOT KEEP THE < > SYMBOLS.
const MONGO_URI = "mongodb+srv://amenuil19_db_user:YOUR_REAL_PASSWORD_HERE@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority";

console.log("⏳ Connecting to MongoDB...");

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => {
      console.error('❌ DB Connection Error:', err.message);
      console.log('HINT: Did you update the password in server.js?');
      console.log('HINT: Did you whitelist IP 0.0.0.0/0 in MongoDB Atlas?');
  });

// ==========================================
// 2. DATABASE SCHEMAS (The Data Models)
// ==========================================

// User Schema (Subscribers)
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    fullName: String,
    email: String,
    age: Number,
    otp: String,
    otpExpires: Date,
    profileComplete: { type: Boolean, default: false },
    device: { name: String, imei: String }, // For Guardian
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Report Schema (Spam/Fraud)
const reportSchema = new mongoose.Schema({
    number: String,
    reason: String,
    comments: String,
    status: { type: String, default: 'Pending' }, // Pending, Suspended
    createdAt: { type: Date, default: Date.now }
});
const SpamReport = mongoose.model('SpamReport', reportSchema);

// Directory Schema (Verified Businesses)
const directorySchema = new mongoose.Schema({
    phoneNumber: String,
    companyName: String,
    category: String,
    status: { type: String, default: 'Verified' }
});
const DirectoryEntry = mongoose.model('DirectoryEntry', directorySchema);

// Enterprise Schema (B2B Customers)
const enterpriseSchema = new mongoose.Schema({
    companyName: String,
    monthlyBill: Number,
    status: { type: String, default: 'Active' },
    tier: String
});
const Enterprise = mongoose.model('Enterprise', enterpriseSchema);


// ==========================================
// 3. API ROUTES (The Logic)
// ==========================================

/* --- AUTHENTICATION --- */
app.post('/api/v1/auth/request-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });

        // Generate Code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save to DB (Upsert: Create if new, update if exists)
        let user = await User.findOne({ phoneNumber });
        if (!user) {
            user = new User({ phoneNumber });
        }
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60000); // 10 mins
        await user.save();

        console.log(`🔐 OTP for ${phoneNumber}: ${otp}`);
        res.json({ success: true, message: "Code sent", testCode: otp });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post('/api/v1/auth/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });

        if (!user) return res.status(400).json({ success: false, message: "User not found" });
        if (user.otp !== code) return res.status(400).json({ success: false, message: "Invalid Code" });

        // Success
        user.otp = null;
        await user.save();
        
        // Send back user info so app knows if they need to finish profile
        res.json({ success: true, user: user, isNewUser: !user.profileComplete });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/v1/profile', async (req, res) => {
    try {
        const { phoneNumber, fullName, email, age } = req.body;
        const user = await User.findOneAndUpdate(
            { phoneNumber },
            { fullName, email, age, profileComplete: true },
            { new: true }
        );
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

/* --- REPORTS (Public App) --- */
app.post('/api/v1/reports', async (req, res) => {
    try {
        const { number, reason, comments } = req.body;
        console.log("⚠️ Received Report:", number);
        
        const newReport = new SpamReport({ number, reason, comments });
        await newReport.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error("Report Error", error);
        res.status(500).json({ success: false });
    }
});

/* --- LOOKUP (Caller ID) --- */
app.get('/api/v1/lookup/call/:number', async (req, res) => {
    try {
        const { number } = req.params;
        
        // 1. Check Directory
        const dirMatch = await DirectoryEntry.findOne({ phoneNumber: number });
        if(dirMatch) return res.json({ status: 'verified', name: dirMatch.companyName });

        // 2. Check Spam Reports
        const spamCount = await SpamReport.countDocuments({ number: number });
        if(spamCount > 0) return res.json({ status: 'warning', count: spamCount });

        res.json({ status: 'unverified' });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

/* --- OWNER DASHBOARD --- */
app.post('/api/v1/owner/login', (req, res) => {
    const { username, password } = req.body;
    if(username === 'owner' && password === 'admin123') {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Invalid credentials" });
    }
});

app.get('/api/v1/owner/stats', async (req, res) => {
    // Mock stats for MVP
    res.json({
        totalMonthlyRevenue: 50000,
        totalEnterprises: await Enterprise.countDocuments(),
        totalB2CSubscribers: await User.countDocuments()
    });
});

app.get('/api/v1/owner/fraud-reports', async (req, res) => {
    const reports = await SpamReport.find().sort({ createdAt: -1 }).limit(20);
    const formatted = reports.map(r => ({
        number: r.number,
        reason: r.reason,
        comments: r.comments,
        status: r.status,
        createdAt: r.createdAt
    }));
    res.json(formatted);
});

app.post('/api/v1/owner/suspend-number', async (req, res) => {
    try {
        await SpamReport.updateMany({ number: req.body.number }, { status: 'Suspended' });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ==========================================
// 4. START SERVER
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});