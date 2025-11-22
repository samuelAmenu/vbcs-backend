const mongoose = require('mongoose');

// This is the blueprint for a device registered to a VBCS customer
const deviceSchema = new mongoose.Schema({
    // This will link the device to the user who owns it
    userId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true 
    },
    deviceName: {
        type: String,
        default: 'VBCS Phone'
    },
    ipAddress: {
        type: String,
        required: true // We log the IP on first connection/update
    },
    // Location Data (for the Locator feature)
    lastKnownLocation: {
        type: String, // e.g., Meskel Square, Addis Ababa
        required: true
    },
    batteryPercent: {
        type: Number,
        default: 100
    },
    // The device's current security state
    securityStatus: {
        type: String,
        enum: ['Active', 'Lost Mode', 'Wipe Pending'],
        default: 'Active'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Device', deviceSchema);