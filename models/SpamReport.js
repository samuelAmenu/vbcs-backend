const mongoose = require('mongoose');

// This is the "Schema," or the blueprint for our data
const spamReportSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    reportCount: {
        type: Number,
        default: 1
    },
    category: { 
        type: String,
        default: 'Scam / Fraud'
    },
    comment: {
        type: String
    },
    status: {
        type: String,
        default: 'Under Review'
    }
});

const SpamReport = mongoose.model('SpamReport', spamReportSchema);

module.exports = SpamReport;