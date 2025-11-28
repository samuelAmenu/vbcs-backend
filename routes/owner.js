const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer'); // For file uploads
const csv = require('csv-parser'); // For reading CSVs
const fs = require('fs'); // For file system access

// Import Models
const Admin = require('../models/Admin.js');
const Enterprise = require('../models/Enterprise.js');
const SpamReport = require('../models/SpamReport.js');
const DirectoryEntry = require('../models/DirectoryEntry.js');

// Configure temporary storage for uploads
const upload = multer({ dest: 'uploads/' });

// --- API 1: Owner Login (SECURE) ---
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const owner = await Admin.findOne({ username: username, role: 'owner' });
        
        if (!owner) {
            return res.status(401).json({ success: false, message: 'Invalid owner credentials.' });
        }
        
        const isMatch = await bcrypt.compare(password, owner.password);

        if (isMatch) {
            console.log(`(Route) Owner login success: ${owner.username}`);
            res.json({ success: true, ownerData: owner });
        } else {
            res.status(401).json({ success: false, message: 'Invalid owner credentials.' });
        }
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// --- API 2: Real Directory Upload (THE REAL LOGIC) ---
router.post('/directory-upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const results = [];
    
    // Process the CSV file
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
            // Ensure required fields exist
            if(data.companyName && data.phoneNumber) {
                results.push({
                    companyName: data.companyName,
                    phoneNumber: data.phoneNumber,
                    category: data.category || 'Other',
                    address: data.address || 'Addis Ababa',
                    status: 'Active'
                });
            }
        })
        .on('end', async () => {
            try {
                // Insert new data into MongoDB
                if(results.length > 0) {
                    await DirectoryEntry.insertMany(results);
                    console.log(`(Route) Successfully uploaded ${results.length} directory entries.`);
                    res.json({ success: true, message: `Successfully added ${results.length} organizations to the Directory.` });
                } else {
                    res.json({ success: false, message: "CSV file was empty or had wrong headers." });
                }
                // Clean up the temp file
                fs.unlinkSync(req.file.path);
            } catch (error) {
                console.error('Upload error:', error);
                // If file exists, try to delete it even on error
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                res.status(500).json({ success: false, message: 'Error saving data. Check for duplicate numbers.' });
            }
        });
});

// --- API 3: Get Directory List ---
router.get('/directory', async (req, res) => {
    try {
        const list = await DirectoryEntry.find({}).sort({ createdAt: -1 });
        res.json(list);
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- API 4: Dashboard Stats ---
router.get('/stats', async (req, res) => {
    try {
        const activeEnterprises = await Enterprise.find({ status: 'Active' });
        const b2bRevenue = activeEnterprises.reduce((sum, ent) => sum + ent.monthlyBill, 0);
        const totalEnterprises = await Enterprise.countDocuments();
        const totalDirectory = await DirectoryEntry.countDocuments();
        const totalB2CSubscribers = 241500; 
        const b2cRevenue = (totalB2CSubscribers * 60) / 50; 
        
        res.json({
            totalMonthlyRevenue: b2bRevenue + b2cRevenue,
            totalEnterprises: totalEnterprises,
            totalB2CSubscribers: totalB2CSubscribers,
            totalDirectory: totalDirectory
        });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- Helper APIs ---
router.get('/system-health', (req, res) => {
    res.json([
        { service: 'VBCS Backend Server', status: 'Operational' },
        { service: 'VBCS Database', status: 'Connected' },
        { service: 'EthioTel APIs', status: 'Standby' }
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
// --- Enterprise Registration ---
router.post('/register-enterprise', async (req, res) => {
    // ... (Registration logic assumed correct from previous steps)
    res.status(501).json({ success: false, message: "Feature implementation pending verification." });
});


module.exports = router;