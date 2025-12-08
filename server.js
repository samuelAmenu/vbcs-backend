// ==================================================
//  VBCS MASTER SERVER (Production Ready)
// ==================================================

// 1. SETUP & IMPORTS
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose'); // Added Mongoose here
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 3000;

// 2. DATABASE CONNECTION (Integrated)
// --------------------------------------------------
// REPLACE <your_real_password> BELOW WITH YOUR ACTUAL PASSWORD
// REMOVE THE < > SYMBOLS
const MONGO_URI = "mongodb+srv://amenuil19_db_user:<your_real_password>@vbcs-project.7far1jp.mongodb.net/?appName=VBCS-Project";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ DB Connection Error:', err));

// 3. IMPORT ROUTE ENGINES
// These files handle the specific logic for each feature
const authRoutes = require('./routes/auth.js');      
const lookupRoutes = require('./routes/lookup.js');  
const ownerRoutes = require('./routes/owner.js');    
const guardianRoutes = require('./routes/guardian.js'); 
const adminRoutes = require('./routes/admin.js'); 

// 4. MIDDLEWARE
app.use(cors()); // Allow Frontend access
app.use(express.json()); // Allow JSON data

// 5. CONNECT ROUTES
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/lookup', lookupRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/guardian', guardianRoutes);
app.use('/api/v1/admin', adminRoutes);

// 6. HEALTH CHECK
app.get('/', (req, res) => {
    res.send('✅ VBCS Backend is Live & Connected');
});

// 7. START SERVER
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});