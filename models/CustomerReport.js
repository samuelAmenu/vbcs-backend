const mongoose = require('mongoose');

// This is the blueprint for reports about *verified businesses*
const customerReportSchema = new mongoose.Schema({
    enterpriseId: { 
        type: String, 
        required: true
    },
    reportedNumber: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    comment: {
        type: String
    },
    status: {
        type: String,
        default: 'New'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const CustomerReport = mongoose.model('CustomerReport', customerReportSchema);

module.exports = CustomerReport;