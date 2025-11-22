const mongoose = require('mongoose');

// This model stores the temporary login codes (OTPs)
const authTicketSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        index: true
    },
    code: {
        type: String,
        required: true
    },
    // This tells MongoDB to automatically delete the document after 5 minutes
    expiresAt: {
        type: Date,
        required: true,
        default: Date.now,
        expires: 300 // 300 seconds = 5 minutes
    }
});

module.exports = mongoose.model('AuthTicket', authTicketSchema);