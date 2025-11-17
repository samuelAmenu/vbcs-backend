const mongoose = require('mongoose');

// This is the blueprint for our Enterprise data in MongoDB
const enterpriseSchema = new mongoose.Schema({
    companyName: {
        type: String,
        required: true
    },
    tier: {
        type: String,
        required: true,
        enum: ['Basic', 'Standard', 'Premium'] // Only allows these values
    },
    status: {
        type: String,
        required: true,
        default: 'Pending Approval' // New businesses start as pending
    },
    monthlyBill: {
        type: Number,
        required: true
    },
    // This is the "login" username
    username: {
        type: String,
        required: true,
        unique: true
    },
    // This will be a hash in a real app
    password: {
        type: String,
        required: true
    },
    // This links to the verified number in the simple db.js
    registeredNumber: { 
        type: String,
        required: true
    }
});

const Enterprise = mongoose.model('Enterprise', enterpriseSchema);

module.exports = Enterprise;