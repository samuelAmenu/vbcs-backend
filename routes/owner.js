const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); // <-- NEW: Import hashing tool
const Admin = require('../models/Admin.js'); // Owner is in the "Admin" model
const Enterprise = require('../models/Enterprise.js');
const SpamReport = require('../models/SpamReport.js');

// --- API for Owner Login (NOW SECURE) ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 1. Find the owner user in the REAL database
        const owner = await Admin.findOne({ username: username, role: 'owner' });
        
        if (!owner) {
            console.log(`(Route) Owner login failed: User not found`);
            return res.status(401).json({ success: false, message: 'Invalid owner credentials.' });
        }
        
        // 2. Securely compare the hashed password
        const isMatch = await bcrypt.compare(password, owner.password);

        if (isMatch) {
            console.log(`(Route) Owner login success: ${owner.username}`);
            // In a real system, we'd send a secure JWT (JSON Web Token)
            res.json({ success: true, ownerData: owner });
        } else {
            console.log(`(Route) Owner login failed: Invalid password`);
            res.status(401).json({ success: false, message: 'Invalid owner credentials.' });
        }
    } catch (error) { 
        console.error("Owner login error:", error);
        res.status(500).json({ success: false, message: 'Server error' }); 
    }
});

// --- API for Main Dashboard Stats (NOW USES MONGODB) ---
router.get('/stats', async (req, res) => {
    try {
        console.log("(Route) Fetching REAL dashboard stats for owner.");
        
        // 1. Get B2B data from MongoDB
        const activeEnterprises = await Enterprise.find({ status: 'Active' });
        const b2bRevenue = activeEnterprises.reduce((sum, ent) => sum + ent.monthlyBill, 0);
        const totalEnterprises = await Enterprise.countDocuments();

        // 2. Get B2C data (we'll simulate this part for now)
        const totalB2CSubscribers = 241500; // Simulating
        const b2cRevenue = (totalB2CSubscribers * 60) / 50; // 2 ETB/day * 30 days / 50 ETB/$
        
        res.json({
            totalMonthlyRevenue: b2bRevenue + b2cRevenue,
            totalEnterprises: totalEnterprises,
            totalB2CSubscribers: totalB2CSubscribers
        });
    } catch (error) {
        console.error("Error fetching owner stats:", error);
        res.status(500).json({ success: false, message: "Error fetching stats" });
    }
});

// --- API for System Health (No change, this is a simulation) ---
router.get('/system-health', (req, res) => {
    console.log("(Route) Fetching system health for owner.");
    res.json([
        { service: 'VBCS Backend Server', status: 'Operational' },
        { service: 'VBCS Database', status: 'Connected' },
        { service: 'EthioTel Payment API', status: 'Standby' },
        { service: 'EthioTel Call Display API', status: 'Standby' },
    ]);
});

// --- API to get all enterprises (NOW USES MONGODB) ---
router.get('/enterprises', async (req, res) => {
    try {
        console.log("(Route) Fetching all enterprises for owner.");
        const enterprises = await Enterprise.find({});
        res.json(enterprises);
    } catch (error) {
        console.error("Error fetching enterprises:", error);
        res.status(500).json({ success: false, message: "Error fetching data" });
    }
});

// --- API to get all fraud reports (NOW USES MONGODB) ---
router.get('/fraud-reports', async (req, res) => {
    try {
        console.log("(Route) Fetching all fraud reports for owner.");
        const reports = await SpamReport.find({});
        
        const fraudReports = reports.map(report => ({
            reported_number: report.phoneNumber,
            category: report.category,
            report_count: report.reportCount,
            status: report.status
        }));
        res.json(fraudReports);
    } catch (error) {
        console.error("Error fetching fraud reports:", error);
        res.status(500).json({ success: false, message: "Error fetching reports" });
    }
});

module.exports = router;