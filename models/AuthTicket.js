const mongoose = require('mongoose');

// 1. Define the Schema (Variable name is 'authTicketSchema')
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
        default: Date.now 
    }
}, { collection: 'authtickets' }); // Force collection name to be lowercase 'authtickets'

// 2. Export the Model
// First argument: 'AuthTicket' (The Model Name)
// Second argument: authTicketSchema (The variable defined above - MUST MATCH)
module.exports = mongoose.model('AuthTicket', authTicketSchema);