,   require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
//// ==========================================
// 1. DATABASE CONNECTION
// ==========================================

// FIX: Wrap the address in quotes " " and assign it to const MONGO_URI
// IMPORTANT: Replace <db_password> with your actual password!
const MONGO_URI = "mongodb+srv://amenuil19_db_user:<db_password>@vbcs-project.7far1jp.mongodb.net/?appName=VBCS-Project";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Connection Error:', err));

// ==========================================
// 2. MONGOOSE SCHEMAS
// ==========================================

// --- A. User Schema (Subscribers) ---
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    fullName: String,
    email: String,
    age: Number,
    otp: String,           // Stores the temporary code
    otpExpires: Date,      // When the code expires
    profileComplete: { type: Boolean, default: false }, // Triggers wizard if false
    device: {
        imei: String,
        model: String,
        name: String
    },
    familyMembers: [{ name: String, phone: String, status: String }],
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// --- B. Enterprise Schema (Business Customers) ---
const enterpriseSchema = new mongoose.Schema({
    companyName: String,
    registeredNumber: String,
    tinNumber: String,
    tier: String, // Basic, Premium
    status: { type: String, default: 'Active' },
    monthlyBill: Number,
    username: String,
    createdAt: { type: Date, default: Date.now }
});
const Enterprise = mongoose.model('Enterprise', enterpriseSchema);

// --- C. Directory Schema (The "Source of Truth") ---
const directorySchema = new mongoose.Schema({
    phoneNumber: String,
    companyName: String,
    category: String, // e.g., "Bank", "Government"
    status: { type: String, default: 'Verified' },
    address: String
});
const DirectoryEntry = mongoose.model('DirectoryEntry', directorySchema);

// --- D. Report Schema (Spam Reports) ---
const reportSchema = new mongoose.Schema({
    number: String,
    reason: String,
    comments: String,
    reportedBy: String,
    status: { type: String, default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});
const SpamReport = mongoose.model('SpamReport', reportSchema);


// ==========================================
// 3. API ROUTES
// ==========================================

// --- AUTH: REQUEST CODE (REAL LOGIC) ---
app.post('/api/v1/auth/request-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });

        // Generate Real 6-Digit Code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 10 * 60000); // 10 mins

        // Find or Create User
        let user = await User.findOne({ phoneNumber });
        if (!user) {
            user = new User({ phoneNumber });
        }
        
        // Save OTP to DB
        user.otp = otp;
        user.otpExpires = expires;
        await user.save();

        console.log(`🔐 OTP for ${phoneNumber}: ${otp}`);

        // Return code in response (for MVP/Testing since we don't have SMS Gateway yet)
        res.json({ success: true, message: "Code sent", testCode: otp });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- AUTH: VERIFY CODE (REAL LOGIC) ---
app.post('/api/v1/auth/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        
        const user = await User.findOne({ phoneNumber });
        
        if (!user) return res.status(400).json({ success: false, message: "User not found" });
        if (user.otp !== code) return res.status(400).json({ success: false, message: "Invalid Code" });
        if (user.otpExpires < Date.now()) return res.status(400).json({ success: false, message: "Code Expired" });

        // Clear OTP after success
        user.otp = null; 
        user.otpExpires = null;
        await user.save();

        // Check if this is a new user who needs the wizard
        const isNewUser = !user.profileComplete;

        res.json({ 
            success: true, 
            user: user, 
            isNewUser: isNewUser 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- PROFILE: SAVE / UPDATE ---
app.post('/api/v1/profile', async (req, res) => {
    try {
        const { phoneNumber, fullName, email, age } = req.body;
        
        // Update user and set profileComplete to true
        const user = await User.findOneAndUpdate(
            { phoneNumber },
            { fullName, email, age, profileComplete: true },
            { new: true } // Return updated doc
        );

        if(!user) return res.status(404).json({ success: false, message: "User not found" });

        res.json({ success: true, user });

    } catch (err) {
        res.status(500).json({ success: false, message: "Error saving profile" });
    }
});

// --- PROFILE: DEVICE REGISTRATION ---
app.post('/api/v1/profile/device', async (req, res) => {
    try {
        const { phoneNumber, deviceName, deviceModel, imei } = req.body;
        
        const user = await User.findOne({ phoneNumber });
        if(!user) return res.status(404).json({ success: false });

        user.device = { name: deviceName, model: deviceModel, imei: imei };
        await user.save();

        res.json({ success: true, message: "Device registered" });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- LOOKUP: CALLER ID CHECKER (REAL DB) ---
app.get('/api/v1/lookup/call/:number', async (req, res) => {
    try {
        const { number } = req.params;

        // 1. Check Directory (Verified Businesses)
        const directoryMatch = await DirectoryEntry.findOne({ phoneNumber: number });
        if (directoryMatch) {
            return res.json({ 
                status: 'verified', 
                name: directoryMatch.companyName, 
                category: directoryMatch.category 
            });
        }

        // 2. Check Spam Reports (Community Warning)
        const reportCount = await SpamReport.countDocuments({ number: number });
        if (reportCount > 0) {
            return res.json({ status: 'warning', count: reportCount });
        }

        // 3. Unknown
        res.json({ status: 'unverified' });

    } catch (err) {
        res.status(500).json({ status: 'error' });
    }
});

// --- LOOKUP: DIRECTORY LIST ---
app.get('/api/v1/lookup/directory', async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = {};
        
        if (category && category !== 'All') query.category = category;
        if (search) query.companyName = { $regex: search, $options: 'i' };

        const results = await DirectoryEntry.find(query).limit(50);
        res.json(results);
    } catch (err) {
        res.status(500).json([]);
    }
});

// --- REPORTS: SUBMIT NEW REPORT ---
app.post('/api/v1/reports', async (req, res) => {
    try {
        const { number, reason, comments } = req.body;
        console.log("⚠️ Received Report:", number, reason);

        const newReport = new SpamReport({ number, reason, comments });
        await newReport.save();

        res.json({ success: true, message: "Report logged successfully" });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// --- OWNER: DASHBOARD STATS ---
app.get('/api/v1/owner/stats', async (req, res) => {
    try {
        // Calculate real stats from DB
        const totalEnterprises = await Enterprise.countDocuments();
        const totalSubscribers = await User.countDocuments();
        // Calculate revenue (Mock logic: 800 * basic + 1500 * premium)
        const enterprises = await Enterprise.find();
        let revenue = 0;
        enterprises.forEach(ent => {
            revenue += (ent.monthlyBill || 0);
        });

        res.json({
            totalMonthlyRevenue: revenue,
            totalEnterprises: totalEnterprises,
            totalB2CSubscribers: totalSubscribers
        });
    } catch (err) {
        res.status(500).json({ error: "Stats error" });
    }
});

// --- OWNER: FRAUD REPORTS ---
app.get('/api/v1/owner/fraud-reports', async (req, res) => {
    try {
        const reports = await SpamReport.find().sort({ createdAt: -1 }).limit(50);
        const formatted = reports.map(r => ({
            number: r.number,
            reason: r.reason,
            comments: r.comments,
            status: r.status,
            createdAt: r.createdAt
        }));
        res.json(formatted);
    } catch (err) { res.status(500).json([]); }
});

// --- OWNER: SUSPEND NUMBER ---
app.post('/api/v1/owner/suspend-number', async (req, res) => {
    try {
        const { number } = req.body;
        await SpamReport.updateMany({ number }, { status: 'Suspended' });
        // Optional: Add to a permanent Blacklist collection here
        console.log(`🚫 Suspended ${number}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- OWNER: LOGIN ---
app.post('/api/v1/owner/login', (req, res) => {
    const { username, password } = req.body;
    // Hardcoded Owner Credentials for MVP
    if(username === 'owner' && password === 'admin123') {
        res.json({ success: true, token: 'owner-secret-token' });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

// ==========================================
// 4. START SERVER
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 VBCS Server running on port ${PORT}`);
});