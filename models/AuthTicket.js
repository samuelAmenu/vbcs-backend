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
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // Ticket self-destructs after 600 seconds (10 minutes)
    }
});

module.exports = mongoose.model('AuthTicket', authTicketSchema);