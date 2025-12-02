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
        
        // Force delete any old tickets
        await AuthTicket.deleteMany({ phoneNumber: cleanPhone });
        
        // Create new ticket
        await AuthTicket.create({ phoneNumber: cleanPhone, code: code });
        
        console.log(`(DEBUG) Ticket Created -> Phone: "${cleanPhone}" | Code: "${code}"`);

        await ethioTelecomService.sendSMS(cleanPhone, `Code: ${code}`);
        
        res.json({ success: true, message: 'Code sent.', testCode: code });
    } catch (error) {
        console.error('Request error:', error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- API 2: Verify Code (DEBUG MODE) ---
router.post('/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const cleanPhone = phoneNumber.trim();
        const cleanCode = code.trim();

        console.log(`(DEBUG) Verifying -> Input Phone: "${cleanPhone}" | Input Code: "${cleanCode}"`);

        // 1. Check if a ticket exists for this phone AT ALL
        const ticket = await AuthTicket.findOne({ phoneNumber: cleanPhone });
        
        if (!ticket) {
            console.log(`(DEBUG) Failure: No ticket found for phone "${cleanPhone}"`);
            return res.status(401).json({ success: false, message: `No code found for ${cleanPhone}. Request a new one.` });
        }

        // 2. Check if code matches
        if (ticket.code !== cleanCode) {
            console.log(`(DEBUG) Failure: Code mismatch. DB has "${ticket.code}", User sent "${cleanCode}"`);
            return res.status(401).json({ success: false, message: `Wrong code. (Hint: It was ${ticket.code})` });
        }
        
        // 3. Success! Cleanup
        await AuthTicket.deleteOne({ _id: ticket._id });

        let user = await User.findOne({ phoneNumber: cleanPhone });
        const isNewUser = !user;

        if (!user) {
            const defaultPassword = generateCode();
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            user = await User.create({ phoneNumber: cleanPhone, password: hashedPassword, plan: 'free' });
        }
        
        res.json({ success: true, message: 'Login successful!', isNewUser: isNewUser, user: user });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- API 3: Password Login ---
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

// --- API 4: Update Profile ---
router.post('/update-profile', async (req, res) => {
    try {
        const { phoneNumber, password, fullName, imei, email, age } = req.body;
        const user = await User.findOne({ phoneNumber: phoneNumber });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        if (fullName) user.fullName = fullName;
        if (imei) user.imei = imei;
        if (email) user.email = email;
        if (age) user.age = age;
        if (password) user.password = await bcrypt.hash(password, 10);

        await user.save();
        res.json({ success: true, message: 'Profile updated.', user: user });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;