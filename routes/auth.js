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
        
        // FIX: Clean the input (remove spaces) before saving
        const cleanPhone = phoneNumber.trim(); 
        const code = generateCode();
        
        // Cleanup old tickets
        await AuthTicket.deleteMany({ phoneNumber: cleanPhone });
        
        // Save new ticket with CLEAN phone number
        await AuthTicket.create({ phoneNumber: cleanPhone, code: code });
        
        // Logging for debugging on Render
        console.log(`(DEBUG) Created Ticket -> Phone: "${cleanPhone}" | Code: "${code}"`);

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
        
        // FIX: Clean the inputs exactly the same way
        const cleanPhone = phoneNumber.trim();
        const cleanCode = code.trim();

        console.log(`(DEBUG) Verifying -> Phone: "${cleanPhone}" | Input Code: "${cleanCode}"`);

        // Find ticket
        const ticket = await AuthTicket.findOne({ phoneNumber: cleanPhone, code: cleanCode });
        
        if (!ticket) {
            // Debugging help in logs
            const existing = await AuthTicket.findOne({ phoneNumber: cleanPhone });
            console.log(`(DEBUG) Mismatch! Found existing ticket for ${cleanPhone}: ${existing ? existing.code : 'NONE'}`);
            return res.status(401).json({ success: false, message: 'Invalid code. Please request a new one.' });
        }
        
        // Success - Delete ticket so it can't be reused
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
        const cleanPhone = phoneNumber.trim(); // Clean here too
        
        const user = await User.findOne({ phoneNumber: cleanPhone });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid login.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) res.json({ success: true, user: user });
        else res.status(401).json({ success: false, message: 'Invalid login.' });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;