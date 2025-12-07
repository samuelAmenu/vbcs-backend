// ==================================================
//  VBCS MASTER SERVER (Production Architecture)
// ==================================================

// 1. Load Secrets (Environment Variables)
require('dotenv').config();

// 2. Import Core Tools
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000; 

// 3. Connect to Database (Logic is in db_connection.js)
const connectToDatabase = require('./db_connection.js');

// 4. Import The "Missing" 300 Lines (Now split into these files)
const authRoutes = require('./routes/auth.js');      // Handles Login, SMS, Profile
const lookupRoutes = require('./routes/lookup.js');  // Handles Caller ID, Directory Search
const ownerRoutes = require('./routes/owner.js');    // Handles CSV Upload, B2B Reg
const guardianRoutes = require('./routes/guardian.js'); // Handles Family Circle, Map
const adminRoutes = require('./routes/admin.js');    // Handles Fraud Reports

// 5. Middleware (Security & Data Parsing)
app.use(cors()); // Allow Frontend to talk to Backend
app.use(express.json()); // Allow JSON data

// 6. Connect Routes to URLs
// This tells the server: "If a request comes for /auth, let auth.js handle it."
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/lookup', lookupRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/guardian', guardianRoutes);
app.use('/api/v1/admin', adminRoutes);

// 7. Health Check (To prove server is alive)
app.get('/', (req, res) => {
    res.send('✅ VBCS Backend is Active & Running Modular Architecture');
});

// 8. Start the Engine
const startServer = async () => {
    try {
        await connectToDatabase();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
    }
};

startServer();