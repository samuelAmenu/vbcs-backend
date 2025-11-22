const express = require('express');
const router = express.Router();

// --- Import REAL Database Models ---
const SpamReport = require('../models/SpamReport.js');
const CustomerReport = require('../models/CustomerReport.js');
const Enterprise = require('../models/Enterprise.js');

// --- API for the "Caller ID Checker" ---
router.get('/call/:number', async (req, res) => {
    try {
        const { number } = req.params;
        
        // 1. Check MongoDB for Verified Enterprise
        const enterprise = await Enterprise.findOne({ registeredNumber: number });
        if (enterprise) {
            return res.json({ status: 'verified', name: enterprise.companyName });
        }
        
        // 2. Check MongoDB for a Spam report
        const report = await SpamReport.findOne({ phoneNumber: number });
        if (report) {
            return res.json({ status: 'warning', count: report.reportCount });
        }
        
        return res.json({ status: 'unverified' });
    } catch (error) { res.status(500).json({ status: 'error' }); }
});

// --- API for the "SMS Sender Check" ---
router.get('/sms/:number', async (req, res) => {
    try {
        const { number } = req.params;

        // 1. Check MongoDB for a Spam report (highest priority)
        const report = await SpamReport.findOne({ phoneNumber: number });
        if (report) {
            return res.json({ status: 'danger', count: report.reportCount });
        }

        // 2. Check MongoDB for a Verified Enterprise
        const enterprise = await Enterprise.findOne({ registeredNumber: number });
        if (enterprise) {
            return res.json({ status: 'verified', name: enterprise.companyName });
        }
        
        return res.json({ status: 'info' });
    } catch (error) { res.status(500).json({ status: 'error' }); }
});

// --- API for submitting a report (THE FINAL FIX) ---
router.post('/reports', async (req, res) => {
    const { number, reason, comment } = req.body;
    
    try {
        const enterprise = await Enterprise.findOne({ registeredNumber: number });

        if (enterprise) {
            // SCENARIO B: Business-Specific Report
            await CustomerReport.create({
                enterpriseId: enterprise.id, 
                reportedNumber: number,
                reason: reason,
                comment: comment
            });
            console.log(`(Route) Saved customer report for ${enterprise.companyName} to MongoDB.`);
        } else {
            // SCENARIO A: System-Wide Spam Report (FINAL ROBUST LOGIC)
            
            const update = {
                $inc: { reportCount: 1 }, // Increment the count by 1
                $set: { category: reason, comment: comment } // Set the latest reason/comment
            };
            
            await SpamReport.findOneAndUpdate(
                { phoneNumber: number }, // Find condition
                update,
                { 
                    upsert: true, // CRITICAL: Creates the document if it doesn't exist
                    new: true, // Returns the newly updated document
                    setDefaultsOnInsert: true // Ensures defaults (like status) are set on creation
                }
            );

            console.log(`(Route) Handled spam report for ${number}. Report written to DB.`);
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Error saving report:", error);
        res.status(500).json({ success: false, message: "Error saving report" });
    }
});

module.exports = router;