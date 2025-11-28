const express = require('express');
const router = express.Router();

// --- Import REAL Database Models ---
const SpamReport = require('../models/SpamReport.js');
const CustomerReport = require('../models/CustomerReport.js');
const Enterprise = require('../models/Enterprise.js');
const DirectoryEntry = require('../models/DirectoryEntry.js'); // <-- NEW IMPORT

// --- NEW API: Public Directory Search ---
// (GET /api/v1/lookup/directory?search=...&category=...)
router.get('/directory', async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = { status: 'Active' }; // Only show active entries

        // Add Search Filter (Case-insensitive)
        if (search) {
            query.companyName = { $regex: search, $options: 'i' };
        }
        
        // Add Category Filter
        if (category && category !== 'All') {
            query.category = category;
        }

        // Fetch results (Limit to 50 to keep app fast)
        const results = await DirectoryEntry.find(query).limit(50).sort({ companyName: 1 });
        
        res.json(results);
    } catch (error) {
        console.error("Directory search error:", error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- API for the "Caller ID Checker" (Existing) ---
router.get('/call/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const enterprise = await Enterprise.findOne({ registeredNumber: number });
        if (enterprise) return res.json({ status: 'verified', name: enterprise.companyName });
        
        // Also check the Directory for non-subscribed but known numbers
        const directoryMatch = await DirectoryEntry.findOne({ phoneNumber: number });
        if (directoryMatch) return res.json({ status: 'verified', name: directoryMatch.companyName });

        const report = await SpamReport.findOne({ phoneNumber: number });
        if (report) return res.json({ status: 'warning', count: report.reportCount });
        
        return res.json({ status: 'unverified' });
    } catch (error) { res.status(500).json({ status: 'error' }); }
});

// --- API for the "SMS Sender Check" (Existing) ---
router.get('/sms/:number', async (req, res) => {
    try {
        const { number } = req.params;
        const report = await SpamReport.findOne({ phoneNumber: number });
        if (report) return res.json({ status: 'danger', count: report.reportCount });
        
        const enterprise = await Enterprise.findOne({ registeredNumber: number });
        if (enterprise) return res.json({ status: 'verified', name: enterprise.companyName });

        const directoryMatch = await DirectoryEntry.findOne({ phoneNumber: number });
        if (directoryMatch) return res.json({ status: 'verified', name: directoryMatch.companyName });
        
        return res.json({ status: 'info' });
    } catch (error) { res.status(500).json({ status: 'error' }); }
});

// --- API for submitting a report (Existing) ---
router.post('/reports', async (req, res) => {
    const { number, reason, comment } = req.body;
    try {
        const enterprise = await Enterprise.findOne({ registeredNumber: number });
        if (enterprise) {
            await CustomerReport.create({
                enterpriseId: enterprise._id, 
                reportedNumber: number,
                reason: reason,
                comment: comment
            });
        } else {
            await SpamReport.findOneAndUpdate(
                { phoneNumber: number },
                { $inc: { reportCount: 1 }, $set: { category: reason, comment: comment } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;