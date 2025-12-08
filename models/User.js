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
    
    // --- Profile Details ---
    fullName: { type: String, default: 'Subscriber' },
    email: { type: String },
    imei: { type: String },
    age: { type: Number },
    
    // --- Subscription Status ---
    plan: { 
        type: String, 
        enum: ['free', 'premium'],
        default: 'free' 
    },
    subscriptionExpires: { type: Date },

    // --- NEW: Guardian Circle (The Real Family List) ---
    familyMembers: [{
        name: String,
        phone: String,
        status: { 
            type: String, 
            enum: ['Pending', 'Active'], 
            default: 'Pending' 
        },
        addedAt: { type: Date, default: Date.now }
    }],

    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('User', userSchema);