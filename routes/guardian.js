const express = require('express');
const router = express.Router();
const User = require('../models/User.js');

// --- API 1: Get My Circle Members ---
router.post('/get-circle', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const user = await User.findOne({ phoneNumber });
        
        if (!user) return res.status(404).json({ success: false });
        
        res.json({ success: true, members: user.familyMembers });
    } catch (error) { res.status(500).json({ success: false }); }
});

// --- API 2: Add a Family Member ---
router.post('/add-member', async (req, res) => {
    try {
        const { ownerPhone, memberName, memberPhone } = req.body;
        
        const user = await User.findOne({ phoneNumber: ownerPhone });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // Check if already added
        const exists = user.familyMembers.find(m => m.phone === memberPhone);
        if (exists) return res.status(400).json({ success: false, message: "Member already in circle." });

        // Add to array
        user.familyMembers.push({
            name: memberName,
            phone: memberPhone,
            status: 'Active' // In a real app, this would be 'Pending' until they accept SMS invite
        });

        await user.save();
        console.log(`(Route) Added ${memberName} to ${ownerPhone}'s circle.`);
        
        res.json({ success: true, message: "Member added successfully!", members: user.familyMembers });

    } catch (error) { res.status(500).json({ success: false, message: "Server error" }); }
});

module.exports = router;