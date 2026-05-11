const mongoose = require('mongoose');

// This model manages the relationship for device sharing permissions
const guardianCircleSchema = new mongoose.Schema({
    // The user who owns the device and grants the permission
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    },
    // The user who is granted permission to locate the device
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Active', 'Revoked'],
        default: 'Pending' // Requires acceptance in the app
    },
    permissions: {
        type: [String], // Array of permissions
        default: ['Locate'] // We can add 'PlaySound', 'SendAlert' later
    }
});

// Ensures a user cannot invite the same person twice
guardianCircleSchema.index({ ownerId: 1, memberId: 1 }, { unique: true });

module.exports = mongoose.model('GuardianCircle', guardianCircleSchema);