// 1. Import DOTENV first to load local secrets
require('dotenv').config();

// 2. Import core tools
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;
const connectToDatabase = require('./db_connection.js');

// 3. Import route files
const lookupRoutes = require('./routes/lookup.js');
const enterpriseRoutes = require('./routes/enterprise.js');
const adminRoutes = require('./routes/admin.js');
const ownerRoutes = require('./routes/owner.js');
const authRoutes = require('./routes/auth.js'); // <--- CRITICAL LINE

// 4. Set up middleware
app.use(cors());
app.use(express.json());

// 5. Tell the server to USE these routes
app.use('/api/v1/lookup', lookupRoutes);
app.use('/api/v1/enterprise', enterpriseRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/auth', authRoutes); // <--- CRITICAL LINE

// 6. Test Endpoint
app.get('/', (req, res) => {
    res.send('VBCS Backend (Production Structure) is running!');
});

// 7. START THE SERVER & CONNECT TO DB
const startServer = async () => {
    await connectToDatabase();
    app.listen(PORT, () => {
        console.log(`VBCS Backend server is running on http://localhost:${PORT}`);
    });
};

startServer();