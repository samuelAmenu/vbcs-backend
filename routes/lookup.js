const express = require('express');
const router = express.Router();

// --- NEW: Import ALL our models and the simple DB ---
const SpamReport = require('../models/SpamReport.js');
const CustomerReport = require('../models/CustomerReport.js');
const Enterprise = require('../models/Enterprise.js');
const VBCS_Databases = require('../db.js'); // Still used for verifiedNumbers list

// --- API for the "Caller ID Checker" ---
router.get('/call/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const companyName = VBCS_Databases.verifiedNumbers[number];
        if (companyName) {
            return res.json({ status: 'verified', name: companyName });
        }
        const report = await SpamReport.findOne({ phoneNumber: number });
        if (report) {
            return res.json({ status: 'warning', count: report.reportCount });
        } else {
            return res.json({ status: 'unverified' });
        }
    } catch (error) { res.status(500).json({ status: 'error' }); }
});

// --- API for the "SMS Sender Check" ---
router.get('/sms/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const report = await SpamReport.findOne({ phoneNumber: number });
        if (report) {
            return res.json({ status: 'danger', count: report.reportCount });
        }
        const companyName = VBCS_Databases.verifiedNumbers[number];
        if (companyName) {
            return res.json({ status: 'verified', name: companyName });
        }
        return res.json({ status: 'info' });
    } catch (error) { res.status(500).json({ status: 'error' }); }
});

// --- API for submitting a report (THIS IS THE FIX) ---
router.post('/reports', async (req, res) => {
    const { number, reason, comment } = req.body;
    
    try {
        // SCENARIO B: Is it a verified business?
        // We check our simple db.js file for the list
        const companyName = VBCS_Databases.verifiedNumbers[number];

        if (companyName) {
            // Yes. Triage to the Enterprise Dashboard.
            const enterprise = VBCS_Databases.enterprises[companyName.toLowerCase().split(' ')[0]]; // Simple way to find 'cbe'
            
            if (enterprise) {
                const newReport = new CustomerReport({
                    enterpriseId: enterprise.id, // Use the simple 'ent-cbe' id
                    reportedNumber: number,
                    reason: reason,
                    comment: comment
                });
                await newReport.save();
                console.log(`(Route) Saved customer report for ${companyName} to MongoDB.`);
            }
        } else {
            // SCENARIO A: It's an unverified number. Triage to the Admin Portal.
            let report = await SpamReport.findOne({ phoneNumber: number });
            if (report) {
                report.reportCount += 1;
                report.comment = comment;
                await report.save();
                console.log(`(Route) Incremented spam report for ${number}. New count: ${report.reportCount}`);
            } else {
                report = new SpamReport({
                    phoneNumber: number,
                    category: reason, // <-- THE FIX (was "reason")
                    comment: comment
                });
                await report.save();
                console.log(`(Route) Created new spam report for ${number}.`);
            }
        }
        res.json({ success: true });

    } catch (error) {
        console.error("Error saving report:", error);
        res.status(500).json({ success: false, message: "Error saving report" });
    }
});

module.exports = router;