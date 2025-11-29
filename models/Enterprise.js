const mongoose = require('mongoose');

// This is the blueprint for our Enterprise data in MongoDB
const enterpriseSchema = new mongoose.Schema({
    // --- Basic Profile ---
    companyName: {
        type: String,
        required: true,
        index: true
    },
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String, // Hashed password
        required: true
    },
    
    // --- Service Details ---
    registeredNumber: { 
        type: String,
        required: true,
        unique: true // The official service number (e.g., 911555...)
    },
    tier: {
        type: String,
        required: true,
        enum: ['Basic', 'Standard', 'Premium'] 
    },
    monthlyBill: {
        type: Number,
        required: true
    },

    // --- NEW: Legal & Compliance Data ---
    tinNumber: {
        type: String,
        // required: true, // In prod, this is required. For dev, we keep it optional to avoid breaking old data
        sparse: true      // Allows null values if needed
    },
    licenseFile: {
        type: String, // Path to the uploaded file on the server
        default: null
    },

    // --- NEW: Branding (For Verified Calls) ---
    logoUrl: {
        type: String,
        default: 'default_logo.png' // The image shown on the receiver's screen
    },

    // --- NEW: VAS & Network Status ---
    status: {
        type: String,
        required: true,
        enum: ['Pending Approval', 'Active', 'Suspended'],
        default: 'Pending Approval'
    },
    vasStatus: {
        type: String,
        enum: ['Inactive', 'Integration Pending', 'Live'],
        default: 'Inactive' // 'Live' means the Green Badge is working on the network
    },
    crmId: {
        type: String, // The ID linking this to Ethio Telecom's main billing system
        default: null
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Enterprise = mongoose.model('Enterprise', enterpriseSchema);

module.exports = Enterprise;