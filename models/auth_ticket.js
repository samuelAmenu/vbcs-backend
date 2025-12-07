const mongoose = require('mongoose');

const authTicketSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true
    },
    // We removed the 'expires' option. This data will now stay forever 
    // until our code explicitly deletes it. This prevents the "Ghost Deletion" bug.
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('authticket', authticketSchema);