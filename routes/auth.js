const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User.js'); 
const AuthTicket = require('../models/AuthTicket.js');
const ethioTelecomService = require('../services/ethioTelecom.js'); 

// --- Helper function to generate a 6-digit code ---
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- API 1: Request Code (Initiates the Login/Registration) ---
router.post('/request-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number is required.' });
        }
        
        const code = generateCode();
        
        await AuthTicket.deleteMany({ phoneNumber: phoneNumber });
        await AuthTicket.create({ phoneNumber: phoneNumber, code: code });
        await ethioTelecomService.sendSMS(phoneNumber, `Your VBCS login code is: ${code}. It expires in 5 minutes.`);

        console.log(`(Route) Generated and SMS-sent code ${code} for ${phoneNumber}`);
        
        res.json({ success: true, message: 'Code sent successfully. Please check your SMS.', testCode: code });
    } catch (error) {
        console.error('Request Code error:', error);
        res.status(500).json({ success: false, message: 'Server error during code request.' });
    }
});

// --- API 2: Verify Code (Completes SMS Login/Registration) ---
router.post('/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        
        const ticket = await AuthTicket.findOne({ phoneNumber: phoneNumber, code: code });
        
        if (!ticket) { return res.status(401).json({ success: false, message: 'Invalid or expired code.' }); }
        
        await AuthTicket.deleteOne({ _id: ticket._id });

        let user = await User.findOne({ phoneNumber: phoneNumber });
        const isNewUser = !user;

        if (!user) {
            // New user registration
            const defaultPassword = generateCode();
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            
            user = await User.create({ phoneNumber: phoneNumber, password: hashedPassword, plan: 'free' });
            console.log(`(Route) User registered: ${phoneNumber}`);
        }
        
        res.json({ success: true, message: 'Login successful!', isNewUser: isNewUser, user: { id: user._id, phone: user.phoneNumber, plan: user.plan } });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, message: 'Server error during verification.' });
    }
});

// --- NEW API 3: Standard Password Login ---
// (POST /api/v1/auth/login-password)
router.post('/login-password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        // 1. Find the user in the database
        const user = await User.findOne({ phoneNumber: phoneNumber });
        
        if (!user) { return res.status(401).json({ success: false, message: 'Invalid phone number or password.' }); }

        // 2. Securely compare the hashed password
        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            console.log(`(Route) Password login success for: ${phoneNumber}`);
            // Return user object without the password
            res.json({ success: true, message: 'Login successful!', isNewUser: false, user: user });
        } else {
            console.log(`(Route) Password login failed for: ${phoneNumber}`);
            res.status(401).json({ success: false, message: 'Invalid phone number or password.' });
        }
    } catch (error) {
        console.error('Password login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

module.exports = router;