const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); // <-- NEW: Import hashing tool
const Enterprise = require('../models/Enterprise.js');
const CustomerReport = require('../models/CustomerReport.js');

// --- API for Enterprise Login (NOW SECURE) ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        // 1. Find the user in the REAL database
        const enterprise = await Enterprise.findOne({ username: username });
        
        if (!enterprise) {
            console.log(`(Route) Enterprise login failed: User not found`);
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        // 2. Securely compare the hashed password
        const isMatch = await bcrypt.compare(password, enterprise.password);

        if (isMatch) {
            console.log(`(Route) Enterprise login success: ${enterprise.companyName}`);
            res.json({ success: true, enterpriseData: enterprise });
        } else {
            console.log(`(Route) Enterprise login failed: Invalid password`);
            res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// --- API to get customer reports (from last step) ---
router.get('/reports', async (req, res) => {
    try {
        // Find the enterprise (using a static ID for our 'cbe' test)
        const enterprise = await Enterprise.findOne({ username: 'cbe' });
        // Use the REAL MongoDB _id to find reports
        const reports = await CustomerReport.find({ enterpriseId: enterprise.id });
        
        console.log(`(Route) Sending ${reports.length} reports to enterprise dashboard.`);
        res.json(reports);
    } catch (error) { res.status(500).json({ success: false, message: 'Error fetching reports' }); }
});

module.exports = router;