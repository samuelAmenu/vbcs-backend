const mongoose = require('mongoose');

// Define the official categories for searching
const directoryCategories = [
    'Bank / Finance', 
    'Government', 
    'Logistics / Delivery', 
    'NGO / Non-Profit', 
    'Media / Telecom',
    'Healthcare'
];

// This model stores all verified directory data, supporting search functionality
const directoryEntrySchema = new mongoose.Schema({
    companyName: {
        type: String,
        required: true,
        index: true // Indexing this field makes searching by name fast
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true, // Crucial: Each number must be unique
        index: true // Indexing makes searching by number fast
    },
    category: {
        type: String,
        required: true,
        enum: directoryCategories // Must be one of the defined categories
    },
    address: {
        type: String
    },
    status: {
        type: String,
        default: 'Active'
    }
});

module.exports = mongoose.model('DirectoryEntry', directoryEntrySchema);