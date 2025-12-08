const express = require('express');
const router = express.Router();
// Ensure this matches your filename (User.js or user.js)
const User = require('../models/User.js'); 

// --- API 1: Get My Circle Members ---
router.post('/get-circle', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        // Find the user
        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        // Return their family list
        res.json({ success: true, members: user.familyMembers || [] });
    } catch (error) {
        console.error("Get Circle Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// --- API 2: Add a Family Member ---
router.post('/add-member', async (req, res) => {
    try {
        const { ownerPhone, memberName, memberPhone } = req.body;
        
        // 1. Find the Owner (You)
        const user = await User.findOne({ phoneNumber: ownerPhone });
        if (!user) return res.status(404).json({ success: false, message: "User login not found." });

        // 2. Initialize array if it doesn't exist
        if (!user.familyMembers) user.familyMembers = [];

        // 3. Check for duplicates
        const exists = user.familyMembers.find(m => m.phone === memberPhone);
        if (exists) {
            return res.status(400).json({ success: false, message: "This person is already in your circle." });
        }

        // 4. Add the new member
        user.familyMembers.push({
            name: memberName,
            phone: memberPhone,
            status: 'Active', // In a real app, this would be 'Pending' until they verify via SMS
            addedAt: new Date()
        });

        // 5. Save to MongoDB
        await user.save();
        console.log(`(Guardian) Added ${memberName} to ${ownerPhone}'s circle.`);
        
        res.json({ success: true, message: "Member added!", members: user.familyMembers });

    } catch (error) {
        console.error("Add Member Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

module.exports = router;