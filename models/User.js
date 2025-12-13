const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // --- Core Identity ---
    phoneNumber: { 
        type: String, 
        required: true, 
        unique: true,
        index: true
    },
    password: { 
        type: String, 
        required: true 
    },
    
    // --- CRITICAL: Role & Auth ---
    role: {
        type: String,
        enum: ['subscriber', 'admin'],
        default: 'subscriber'
    },
    otp: { type: String },
    otpExpires: { type: Date },

    // --- Profile Details ---
    fullName: { type: String, default: 'Subscriber' },
    email: { type: String },
    profilePic: { type: String },
    imei: { type: String },
    
    // --- Subscription & Status ---
    plan: { 
        type: String, 
        enum: ['free', 'premium'], 
        default: 'free' 
    },
    status: { 
        type: String, 
        enum: ['Safe', 'Lost', 'SOS'], 
        default: 'Safe' 
    },

    // --- Guardian Circle (Family) ---
    familyMembers: [{
        name: String,
        phone: String,
        status: { type: String, enum: ['Pending', 'Active'], default: 'Pending' }
    }],

    // --- Location Data ---
    location: { 
        lat: Number, 
        lng: Number, 
        updatedAt: Date 
    },
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);