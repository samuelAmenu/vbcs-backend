const mongoose = require('mongoose');

// The official categories for your system
const directoryCategories = [
    'Bank / Finance', 
    'Government Office', 
    'Embassy / Consulate', 
    'NGO / International Org', 
    'Media / Broadcast',
    'Healthcare / Emergency',
    'Transport / Logistics',
    'Education',
    'Utility / Telecom'
];

const directoryEntrySchema = new mongoose.Schema({
    companyName: {
        type: String,
        required: true,
        trim: true,
        index: true // Makes searching by name lightning fast
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true, // No two organizations can own the same number
        index: true
    },
    category: {
        type: String,
        required: true,
        enum: directoryCategories // Enforces valid categories
    },
    address: {
        type: String,
        default: 'Addis Ababa, Ethiopia'
    },
    website: {
        type: String
    },
    // In the future, we can store the URL of the logo image here
    logoUrl: {
        type: String,
        default: 'default_logo.png' 
    },
    status: {
        type: String,
        enum: ['Active', 'Suspended'],
        default: 'Active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('DirectoryEntry', directoryEntrySchema);