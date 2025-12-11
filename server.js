/* ==================================================
   VBCS SERVER V5.1 (Fixed Device Schema)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ⚠️ DATABASE CONNECTION
const MONGO_URI = "mongodb+srv://sami_dbuser:SAMI!ame11@vbcs-project.7far1jp.mongodb.net/VBCS_DB?retryWrites=true&w=majority&appName=VBCS-Project";

console.log("⏳ Connecting to MongoDB...");
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
      console.error('❌ DB Error:', err.message);
      console.log("HINT: Ensure IP Whitelist is 0.0.0.0/0");
  });

// --- 1. USER SCHEMA (Explicit Object Definition) ---
const userSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String,
    fullName: String,
    email: String,
    dob: String,
    
    // ✅ FIXED: Explicitly defined as a nested object
    device: { 
        name: { type: String, default: '' },
        imei: { type: String, default: '' },
        type: { type: String, default: 'Mobile' }
    },
    
    location: { lat: Number, lng: Number, updatedAt: Date },
    
    circle: [{ 
        phone: String,
        name: String, 
        status: { type: String, default: 'pending' }
    }],
    invites: [{
        fromName: String,
        fromPhone: String,
        date: { type: Date, default: Date.now }
    }],
    
    otp: String,
    otpExpires: Date,
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Password Logic
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

// Schemas for Features
const reportSchema = new mongoose.Schema({
    number: String, reason: String, comments: String, status: { type: String, default: 'Pending' }, createdAt: { type: Date, default: Date.now }
});
const SpamReport = mongoose.model('SpamReport', reportSchema);

const directorySchema = new mongoose.Schema({
    phoneNumber: String, companyName: String, category: String, status: { type: String, default: 'Verified' }
});
const DirectoryEntry = mongoose.model('DirectoryEntry', directorySchema);

const enterpriseSchema = new mongoose.Schema({
    companyName: String, monthlyBill: Number, status: { type: String, default: 'Active' }, tier: String
});
const Enterprise = mongoose.model('Enterprise', enterpriseSchema);


// --- 2. AUTH ROUTES ---

app.post('/api/v4/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000);
        await user.save();
        res.json({ success: true, testCode: otp });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/v4/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        
        user.otp = null;
        let nextStep = 'home';
        if (user.onboardingStep < 4) {
            if (!user.fullName) nextStep = 'personal';
            else if (!user.device || !user.device.name) nextStep = 'device';
            else if (!user.passwordHash) nextStep = 'password';
        }
        await user.save();
        res.json({ success: true, nextStep, user });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/v4/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || !user.validatePassword(password)) return res.status(400).json({ success: false, message: "Invalid Credentials" });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- 3. ONBOARDING ROUTES (FIXED) ---

app.post('/api/v4/onboarding/personal', async (req, res) => {
    try {
        const { phoneNumber, fullName, email, dob } = req.body;
        await User.findOneAndUpdate({ phoneNumber }, { fullName, email, dob, onboardingStep: 2 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

// ✅ FIXED DEVICE ROUTE
app.post('/api/v4/onboarding/device', async (req, res) => {
    try {
        const { phoneNumber, deviceName, imei } = req.body;
        
        // Explicitly map the fields to match the Schema
        const deviceData = {
            name: deviceName,
            imei: imei,
            type: 'Mobile'
        };

        await User.findOneAndUpdate(
            { phoneNumber }, 
            { device: deviceData, onboardingStep: 3 },
            { new: true, runValidators: true }
        );
        res.json({ success: true });
    } catch(err) { 
        console.error("Device Save Error:", err);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.post('/api/v4/onboarding/password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        user.setPassword(password);
        user.onboardingStep = 4;
        await user.save();
        res.json({ success: true, user });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- 4. GUARDIAN ROUTES ---
app.post('/api/v4/guardian/location', async (req, res) => {
    const { phoneNumber, lat, lng } = req.body;
    await User.findOneAndUpdate({ phoneNumber }, { location: { lat, lng, updatedAt: new Date() } });
    res.json({ success: true });
});

app.post('/api/v4/guardian/invite', async (req, res) => {
    try {
        const { myPhone, targetPhone, name } = req.body;
        const me = await User.findOne({ phoneNumber: myPhone });
        const target = await User.findOne({ phoneNumber: targetPhone });

        if (!target) return res.status(404).json({ success: false, message: "User not found" });

        me.circle.push({ phone: targetPhone, name: name, status: 'pending' });
        target.invites.push({ fromName: me.fullName, fromPhone: me.phoneNumber });
        
        await me.save();
        await target.save();
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.get('/api/v4/guardian/circle', async (req, res) => {
    try {
        const { phone } = req.query;
        const me = await User.findOne({ phoneNumber: phone });
        if(!me) return res.json({ success: true, circle: [], invites: [] });

        const mapData = [];
        for (let member of me.circle) {
            const u = await User.findOne({ phoneNumber: member.phone });
            if (u && u.location) {
                mapData.push({ 
                    name: member.name, 
                    phone: member.phone, 
                    lat: u.location.lat, 
                    lng: u.location.lng 
                });
            }
        }
        res.json({ success: true, circle: mapData, invites: me.invites });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- 5. UTILS ---
app.get('/api/v1/lookup/call/:number', (req, res) => res.json({ status: 'verified', name: "Safe Caller" }));
app.get('/api/v1/lookup/directory', (req, res) => res.json([
    { companyName: "Ethio Telecom", phoneNumber: "994", category: "Government" },
    { companyName: "CBE", phoneNumber: "951", category: "Bank" }
]));

// Owner
app.post('/api/v1/owner/login', (req, res) => {
    const { username, password } = req.body;
    if(username === 'owner' && password === 'admin123') res.json({ success: true });
    else res.json({ success: false, message: "Invalid credentials" });
});

app.get('/api/v1/owner/stats', async (req, res) => {
    try {
        res.json({ totalRevenue: 50000, users: await User.countDocuments() });
    } catch(err) { res.status(500).json({}); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => { console.log(`🚀 Server running on port ${PORT}`); });