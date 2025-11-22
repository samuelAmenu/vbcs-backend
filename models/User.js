const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phoneNumber: { 
        type: String, 
        required: true, 
        unique: true,
        index: true
    },
    // In a real system, the initial password would be sent via SMS
    password: { 
        type: String, 
        required: true 
    },
    plan: { 
        type: String, 
        default: 'free' 
    }
});

module.exports = mongoose.model('User', userSchema);