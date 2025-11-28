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
        
        // Clean the number (remove spaces)
        const cleanPhone = phoneNumber.trim();
        const code = generateCode();
        
        // Delete old, create new
        await AuthTicket.deleteMany({ phoneNumber: cleanPhone });
        await AuthTicket.create({ phoneNumber: cleanPhone, code: code });
        
        console.log(`(DEBUG) Saved Ticket -> Phone: ${cleanPhone} | Code: ${code}`);

        await ethioTelecomService.sendSMS(cleanPhone, `Code: ${code}`);
        
        res.json({ success: true, message: 'Code sent.', testCode: code });
    } catch (error) {
        console.error('Request error:', error);
        res.status(500).json({ success: false });
    }
});

// --- API 2: Verify Code ---
router.post('/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const cleanPhone = phoneNumber.trim();
        const cleanCode = code.trim();

        console.log(`(DEBUG) Verifying -> Phone: ${cleanPhone} | Input Code: ${cleanCode}`);

        // Find ticket
        const ticket = await AuthTicket.findOne({ phoneNumber: cleanPhone, code: cleanCode });
        
        if (!ticket) {
            // Debugging: Find what WAS there (if anything)
            const existing = await AuthTicket.findOne({ phoneNumber: cleanPhone });
            console.log(`(DEBUG) Failed. Found existing ticket for ${cleanPhone}:`, existing ? existing.code : 'NONE');
            return res.status(401).json({ success: false, message: 'Invalid code. Please request a new one.' });
        }
        
        // Success
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
        res.status(500).json({ success: false });
    }
});

// --- API 3: Password Login ---
router.post('/login-password', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber: phoneNumber });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid login.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) res.json({ success: true, user: user });
        else res.status(401).json({ success: false, message: 'Invalid login.' });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;