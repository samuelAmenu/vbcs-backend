// 1. Import DOTENV first to load local secrets
require('dotenv').config();

// 2. Import core tools
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const connectToDatabase = require('./db_connection.js');

// 3. Import route files
const authRoutes = require('./routes/auth.js');
const lookupRoutes = require('./routes/lookup.js');
const ownerRoutes = require('./routes/owner.js');
const guardianRoutes = require('./routes/guardian.js'); // <-- This was missing
const adminRoutes = require('./routes/admin.js');

// 4. Set up middleware
app.use(cors());
app.use(express.json());

// 5. Connect Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/lookup', lookupRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/guardian', guardianRoutes);
app.use('/api/v1/admin', adminRoutes);

// 6. Test Endpoint
app.get('/', (req, res) => {
    res.send('✅ VBCS Production Backend is Active');
});

// 7. START THE SERVER
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