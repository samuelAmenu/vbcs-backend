const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User.js');
const AuthTicket = require('../models/AuthTicket.js');
const ethioTelecomService = require('../services/ethioTelecom.js'); 

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- API 1: Request Code ---
router.post('/request-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: 'Phone number required.' });
        
        const cleanPhone = phoneNumber.trim();
        const code = generateCode();
        
        await AuthTicket.deleteMany({ phoneNumber: cleanPhone });
        await AuthTicket.create({ phoneNumber: cleanPhone, code: code });
        
        console.log(`(DEBUG) SMS Ticket: ${cleanPhone} -> ${code}`);
        await ethioTelecomService.sendSMS(cleanPhone, `Code: ${code}`);
        
        res.json({ success: true, message: 'Code sent.', testCode: code });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- API 2: Verify Code ---
router.post('/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const cleanPhone = phoneNumber.trim();
        const cleanCode = code.trim();

        const ticket = await AuthTicket.findOne({ phoneNumber: cleanPhone, code: cleanCode });
        
        if (!ticket) {
            return res.status(401).json({ success: false, message: 'Invalid code.' });
        }
        
        await AuthTicket.deleteOne({ _id: ticket._id });

        let user = await User.findOne({ phoneNumber: cleanPhone });
        const isNewUser = !user;

        if (!user) {
            // Create placeholder user
            const defaultPassword = generateCode();
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            user = await User.create({ phoneNumber: cleanPhone, password: hashedPassword, plan: 'free' });
        }
        
        res.json({ success: true, message: 'Verified.', isNewUser: isNewUser, user: user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- API 3: Login with Password ---
router.post('/login-password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber: phoneNumber.trim() });
        
        if (!user) return res.status(401).json({ success: false, message: 'User not found.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) res.json({ success: true, user: user });
        else res.status(401).json({ success: false, message: 'Wrong password.' });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- API 4: Complete Profile (THE FIX) ---
router.post('/update-profile', async (req, res) => {
    try {
        const { phoneNumber, password, fullName, imei, email, age } = req.body;
        
        const user = await User.findOne({ phoneNumber: phoneNumber.trim() });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        // Update fields
        if (fullName) user.fullName = fullName;
        if (imei) user.imei = imei;
        if (email) user.email = email;
        if (age) user.age = age;

        // Update Password securely
        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();
        console.log(`(Route) Profile updated for ${phoneNumber}`);
        
        res.json({ success: true, message: 'Profile saved.', user: user });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Save failed" });
    }
});

module.exports = router;