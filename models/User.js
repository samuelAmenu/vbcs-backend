const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    phoneNumber: { 
        type: String, 
        required: true, 
        unique: true,
        index: true
    },
    password: { 
        type: String, 
        required: true 
    },
    plan: { 
        type: String, 
        default: 'free' 
    },
    fullName: { type: String },
    email: { type: String },
    imei: { type: String },
    age: { type: Number },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('User', userSchema);