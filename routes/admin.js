const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); // <-- NEW
const Admin = require('../models/Admin.js');
const SpamReport = require('../models/SpamReport.js');
const Enterprise = require('../models/Enterprise.js');

// --- API for Admin Login (NOW SECURE) ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        // 1. Find the admin user in the REAL database
        const admin = await Admin.findOne({ username: username, role: 'admin' });
        
        if (!admin) {
            console.log(`(Route) Admin login failed: User not found`);
            return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        }

        // 2. Securely compare the hashed password
        const isMatch = await bcrypt.compare(password, admin.password);

        if (isMatch) {
            console.log(`(Route) Admin login success: ${admin.username}`);
            res.json({ success: true, adminData: admin });
        } else {
            console.log(`(Route) Admin login failed: Invalid password`);
            res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        }
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// --- (All other routes for fraud/enterprise lists are fine) ---
router.get('/fraud-reports', async (req, res) => {
    try {
        const reports = await SpamReport.find({});
        res.json(reports.map(r => ({ ...r.toObject(), reported_number: r.phoneNumber })));
    } catch (error) { res.status(500).json({ success: false }); }
});
router.get('/enterprises', async (req, res) => {
    try {
        const enterprises = await Enterprise.find({});
        res.json(enterprises);
    } catch (error) { res.status(500).json({ success: false }); }
});
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