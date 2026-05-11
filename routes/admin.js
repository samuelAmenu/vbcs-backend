const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin.js');
const SpamReport = require('../models/SpamReport.js');
const Enterprise = require('../models/Enterprise.js');

// --- API for Admin Login (Secure) ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username: username, role: 'admin' });
        if (!admin) return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        const isMatch = await bcrypt.compare(password, admin.password);
        if (isMatch) res.json({ success: true, adminData: admin }); else res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// --- API to get all enterprises (for approvals) ---
router.get('/enterprises', async (req, res) => {
    try {
        const enterprises = await Enterprise.find({});
        res.json(enterprises);
    } catch (error) { res.status(500).json({ success: false, message: "Error fetching enterprises" }); }
});

// --- API to get all fraud reports (THE READ FIX) ---
router.get('/fraud-reports', async (req, res) => {
    try {
        console.log("(Route) Fetching REAL fraud reports from MongoDB...");
        const reports = await SpamReport.find({}); 
        
        // Return the raw reports, which Mongoose makes accessible with .toObject()
        // We ensure we only map the fields the frontend needs.
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

// --- (Other routes are correct) ---
router.post('/approve/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const enterprise = await Enterprise.findByIdAndUpdate(id, { status: 'Active' }, { new: true });
        if (!enterprise) return res.status(404).json({ success: false });
        console.log(`(Route) Enterprise ${enterprise.companyName} approved.`);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;