const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/user_model.js');
const AuthTicket = require('../models/auth_ticket.js');
const ethioTelecomService = require('../services/ethioTelecom.js'); 

// Helper
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- API 1: Request Code ---
router.post('/request-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: 'Phone number required.' });
        
        const cleanPhone = phoneNumber.trim();
        const code = generateCode();
        
        // 1. Clean up old tickets
        await AuthTicket.deleteMany({ phoneNumber: cleanPhone });
        
        // 2. Create new ticket
        await AuthTicket.create({ phoneNumber: cleanPhone, code: code });
        
        // 3. Send SMS (This is where it was failing)
        console.log(`(Route) Sending SMS Code: ${code} to ${cleanPhone}`);
        await ethioTelecomService.sendSMS(cleanPhone, `Your VBCS code is: ${code}`);
        
        // 4. Respond
        res.json({ success: true, message: 'Code sent.', testCode: code });

    } catch (error) {
        console.error('Request Code Error:', error);
        // This log will appear in your Render Dashboard if it fails
        res.status(500).json({ success: false, message: "Server Error: Check Logs" });
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
        
        res.json({ success: true, message: 'Success', isNewUser: isNewUser, user: user });

    } catch (error) {
        console.error('Verify Error:', error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- API 3: Password Login ---
router.post('/login-password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber: phoneNumber.trim() });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) res.json({ success: true, user: user });
        else res.status(401).json({ success: false, message: 'Invalid credentials.' });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- API 4: Update Profile ---
router.post('/update-profile', async (req, res) => {
    try {
        const { phoneNumber, password, fullName, imei, email, age } = req.body;
        const user = await User.findOne({ phoneNumber: phoneNumber.trim() });
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        if (fullName) user.fullName = fullName;
        if (imei) user.imei = imei;
        if (email) user.email = email;
        if (age) user.age = age;
        if (password) user.password = await bcrypt.hash(password, 10);

        await user.save();
        res.json({ success: true, user: user });

    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;