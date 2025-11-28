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
        
        // 1. Clean Input
        const cleanPhone = phoneNumber.trim();
        
        // 2. Manual Cleanup: Delete ANY existing tickets for this number (Old or New)
        await AuthTicket.deleteMany({ phoneNumber: cleanPhone });
        
        // 3. Create New Ticket
        const code = generateCode();
        await AuthTicket.create({ 
            phoneNumber: cleanPhone, 
            code: code 
            // No expiry logic here anymore
        });

        // 4. Log for Debugging
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
        
        // 1. Clean Inputs
        const cleanPhone = phoneNumber.trim();
        const cleanCode = code.trim();

        console.log(`(DEBUG) Verifying -> Phone: "${cleanPhone}" | Input Code: "${cleanCode}"`);

        // 2. Find Ticket
        const ticket = await AuthTicket.findOne({ phoneNumber: cleanPhone, code: cleanCode });
        
        if (!ticket) {
            console.log(`(DEBUG) Verification Failed. No matching ticket found.`);
            return res.status(401).json({ success: false, message: 'Invalid code.' });
        }
        
        // 3. Success - Now we delete the ticket manually
        await AuthTicket.deleteOne({ _id: ticket._id });

        // 4. Handle User Account
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
        const cleanPhone = phoneNumber.trim();
        const user = await User.findOne({ phoneNumber: cleanPhone });
        
        if (!user) return res.status(401).json({ success: false, message: 'Invalid login.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) res.json({ success: true, user: user });
        else res.status(401).json({ success: false, message: 'Invalid login.' });
    } catch (error) { res.status(500).json({ success: false }); }
});

module.exports = router;