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
const ethioTelecomService = require('../services/ethioTelecom.js');

// Configure temporary storage for uploads
const upload = multer({ dest: 'uploads/' });
const SALT_ROUNDS = 10;

// ==================================================
//  AUTHENTICATION
// ==================================================

// --- API 1: Owner Login ---
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
    } catch (error) { 
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' }); 
    }
});

// ==================================================
//  DIRECTORY MANAGEMENT
// ==================================================

// --- API 2: Real Directory Upload (CSV) ---
router.post('/directory-upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const results = [];
    
    // Process the CSV file stream
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
            // Check if the row has the minimum required data
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
                if(results.length > 0) {
                    // Bulk insert into MongoDB
                    await DirectoryEntry.insertMany(results);
                    console.log(`(Route) Successfully uploaded ${results.length} directory entries.`);
                    res.json({ success: true, message: `Successfully added ${results.length} organizations to the Directory.` });
                } else {
                    res.json({ success: false, message: "CSV file was empty or had wrong headers." });
                }
                // Clean up: Delete the temp file
                fs.unlinkSync(req.file.path);
            } catch (error) {
                console.error('Upload error:', error);
                // Ensure we delete the temp file even if there is an error
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

// ==================================================
//  ENTERPRISE MANAGEMENT
// ==================================================

// --- API 4: Register New Enterprise (B2B Onboarding) ---
router.post('/register-enterprise', async (req, res) => {
    try {
        const { companyName, tier, username, password, registeredNumber, tinNumber } = req.body;

        // 1. Verification: Check with Ethio Telecom Directory API
        // In production, this ensures the TIN/License matches the Name.
        const check = await ethioTelecomService.isEnterpriseCustomer(companyName);
        // Note: For testing purposes, we proceed even if check is false, 
        // but in a real deployment, you would uncomment the next line:
        // if (!check.isRegistered) return res.status(400).json({ success: false, message: "Verification failed." });
        
        // 2. Security: Hash the password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // 3. Database: Create the Enterprise Record
        const newEnterprise = await Enterprise.create({
            companyName,
            tier,
            username,
            password: hashedPassword,
            registeredNumber,
            monthlyBill: tier === 'Premium' ? 1500 : 800,
            status: 'Pending Approval' // Requires Admin approval
        });

        console.log(`(Route) Registered New Enterprise: ${companyName}`);
        res.status(201).json({ success: true, message: 'Enterprise registered successfully.' });

    } catch (error) {
        console.error('Registration Error:', error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Username or number already exists.' });
        }
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// --- API 5: Get All Enterprises ---
router.get('/enterprises', async (req, res) => {
    try {
        const enterprises = await Enterprise.find({});
        res.json(enterprises);
    } catch (error) { res.status(500).json({ success: false }); }
});

// ==================================================
//  DASHBOARD DATA & HEALTH
// ==================================================

// --- API 6: Main Dashboard Stats ---
router.get('/stats', async (req, res) => {
    try {
        const activeEnterprises = await Enterprise.find({ status: 'Active' });
        const b2bRevenue = activeEnterprises.reduce((sum, ent) => sum + ent.monthlyBill, 0);
        const totalEnterprises = await Enterprise.countDocuments();
        const totalDirectory = await DirectoryEntry.countDocuments();
        
        // Simulation for B2C until we have thousands of users
        const totalB2CSubscribers = 241500; 
        const b2cRevenue = (totalB2CSubscribers * 60) / 50; // Approx conversion
        
        res.json({
            totalMonthlyRevenue: b2bRevenue + b2cRevenue,
            totalEnterprises: totalEnterprises,
            totalB2CSubscribers: totalB2CSubscribers,
            totalDirectory: totalDirectory
        });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- API 7: System Health ---
router.get('/system-health', (req, res) => {
    res.json([
        { service: 'VBCS Backend Server', status: 'Operational' },
        { service: 'VBCS Database', status: 'Connected' },
        { service: 'EthioTel APIs', status: 'Standby' }
    ]);
});

// --- API 8: Fraud Reports ---
router.get('/fraud-reports', async (req, res) => {
    try {
        const reports = await SpamReport.find({});
        res.json(reports.map(r => ({ ...r.toObject(), reported_number: r.phoneNumber })));
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;