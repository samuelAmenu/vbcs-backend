const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin.js');
const Enterprise = require('../models/Enterprise.js');
const SpamReport = require('../models/SpamReport.js');
const DirectoryEntry = require('../models/DirectoryEntry.js'); // <-- NEW
const ethioTelecomService = require('../services/ethioTelecom.js'); // <-- NEW

const SALT_ROUNDS = 10;

// --- API for Owner Login (Securely checks MongoDB) ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const owner = await Admin.findOne({ username: username, role: 'owner' });
        if (!owner) return res.status(401).json({ success: false, message: 'Invalid owner credentials.' });
        const isMatch = await bcrypt.compare(password, owner.password);
        if (isMatch) {
            console.log(`(Route) Owner login success: ${owner.username}`);
            res.json({ success: true, ownerData: owner });
        } else {
            res.status(401).json({ success: false, message: 'Invalid owner credentials.' });
        }
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// --- NEW: API for Standard B2B Enterprise Onboarding (Registration) ---
router.post('/register-enterprise', async (req, res) => {
    try {
        const { companyName, tier, username, password, registeredNumber, tinNumber } = req.body;

        // 1. Check with Ethio Telecom Directory API first (simulated)
        const check = await ethioTelecomService.isEnterpriseCustomer(companyName);
        if (!check.isRegistered) {
            return res.status(400).json({ success: false, message: "Error: Could not verify TIN/Licence with Ethio Telecom Directory." });
        }

        // 2. Hash Password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // 3. Create Enterprise in MongoDB
        const newEnterprise = await Enterprise.create({
            companyName,
            tier,
            username,
            password: hashedPassword,
            registeredNumber,
            monthlyBill: tier === 'Premium' ? 1500 : 800,
            status: 'Pending Approval' // Owner sets to Active after internal check
        });

        console.log(`(Route) NEW Enterprise Registered: ${companyName} (${newEnterprise._id})`);
        res.status(201).json({ success: true, message: 'Enterprise registered successfully and pending approval.' });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Username or registered number already exists.' });
        }
        console.error('B2B Registration Error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// --- NEW: API for Directory Mass Upload (Placeholder) ---
// Note: In a real system, this would use a package like 'multer' and 'xlsx'
router.post('/directory-upload', (req, res) => {
    // This simulates accepting the file for processing
    console.log('(Route) Received request for Directory Mass Upload.');
    res.json({ 
        success: true, 
        message: 'Directory file received. Processing 150 entries in background...' 
    });
});


// --- (Other routes for stats/reports are unchanged) ---
router.get('/stats', async (req, res) => {
    try {
        const activeEnterprises = await Enterprise.find({ status: 'Active' });
        const b2bRevenue = activeEnterprises.reduce((sum, ent) => sum + ent.monthlyBill, 0);
        const totalEnterprises = await Enterprise.countDocuments();
        const totalB2CSubscribers = 241500;
        const b2cRevenue = (totalB2CSubscribers * 60) / 50; 
        res.json({ totalMonthlyRevenue: b2bRevenue + b2cRevenue, totalEnterprises, totalB2CSubscribers });
    } catch (error) { res.status(500).json({ success: false }); }
});
router.get('/system-health', (req, res) => {
    res.json([
        { service: 'VBCS Backend Server', status: 'Operational' },
        { service: 'VBCS Database', status: 'Connected' },
        { service: 'EthioTel Payment API', status: 'Standby' },
        { service: 'EthioTel Call Display API', status: 'Standby' },
    ]);
});
router.get('/enterprises', async (req, res) => {
    try {
        const enterprises = await Enterprise.find({});
        res.json(enterprises);
    } catch (error) { res.status(500).json({ success: false }); }
});
router.get('/fraud-reports', async (req, res) => {
    try {
        const reports = await SpamReport.find({});
        res.json(reports.map(r => ({ ...r.toObject(), reported_number: r.phoneNumber })));
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;