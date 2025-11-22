const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User.js');
const AuthTicket = require('../models/AuthTicket.js');
const ethioTelecomService = require('../services/ethioTelecom.js'); 

// --- Helper function to generate a 6-digit code ---
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- API 1: Request Code (Initiates the Login/Registration) ---
// (POST /api/v1/auth/request-code)
router.post('/request-code', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number is required.' });
        }
        
        const code = generateCode(); // Generates random code
        
        // 1. Delete any existing tickets for this number
        await AuthTicket.deleteMany({ phoneNumber: phoneNumber });

        // 2. Save the new ticket to the database
        const newTicket = new AuthTicket({
            phoneNumber: phoneNumber,
            code: code,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000) 
        });
        await newTicket.save();

        // 3. Simulate sending the SMS
        await ethioTelecomService.sendSMS(phoneNumber, `Your VBCS login code is: ${code}. It expires in 5 minutes.`);

        console.log(`(Route) Generated and SMS-sent code ${code} for ${phoneNumber}`);
        
        res.json({ 
            success: true, 
            message: 'Code sent successfully. Please check your SMS.',
            // We send the code back here only for local testing purposes!
            testCode: code 
        });

    } catch (error) {
        console.error('Request Code error:', error);
        res.status(500).json({ success: false, message: 'Server error during code request.' });
    }
});

// --- API 2: Verify Code (Completes the Login/Registration) ---
// (POST /api/v1/auth/verify-code)
router.post('/verify-code', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        
        // 1. Find the valid, non-expired ticket
        const ticket = await AuthTicket.findOne({
            phoneNumber: phoneNumber,
            code: code
        });
        
        if (!ticket) {
            return res.status(401).json({ success: false, message: 'Invalid or expired code.' });
        }
        
        // 2. Code is valid. Clean up the ticket immediately.
        await AuthTicket.deleteOne({ _id: ticket._id });

        // 3. Find or Create the User
        let user = await User.findOne({ phoneNumber: phoneNumber });
        const isNewUser = !user;

        if (!user) {
            // New user registration. Create the account.
            const defaultPassword = generateCode();
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);
            
            user = await User.create({
                phoneNumber: phoneNumber,
                password: hashedPassword, 
                plan: 'free' 
            });
            console.log(`(Route) User registered: ${phoneNumber}`);
        }
        
        // 4. Successful login.
        res.json({ 
            success: true, 
            message: 'Login successful!',
            isNewUser: isNewUser,
            user: { id: user._id, phone: user.phoneNumber, plan: user.plan }
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, message: 'Server error during verification.' });
    }
});

module.exports = router;