const mongoose = require('mongoose');

// This is the blueprint for Ethio Telecom and Owner accounts
const adminSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['admin', 'owner'], // 'admin' is for EthioTel, 'owner' is for you
        required: true 
    }
});

// This line exports the model, which includes the .deleteMany() function
module.exports = mongoose.model('Admin', adminSchema);