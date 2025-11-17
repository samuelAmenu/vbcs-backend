// 1. Import our tools
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// --- NEW: Import our database connection ---
const connectToDatabase = require('./db_connection.js');

// 2. Set up middleware
app.use(cors());
app.use(express.json());

// 3. Import our "Route" files
const lookupRoutes = require('./routes/lookup.js');
const enterpriseRoutes = require('./routes/enterprise.js');
const adminRoutes = require('./routes/admin.js');
const ownerRoutes = require('./routes/owner.js');

// 4. Tell the server to USE these routes
app.use('/api/v1/lookup', lookupRoutes);
app.use('/api/v1/enterprise', enterpriseRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/owner', ownerRoutes);

// 5. Test Endpoint
app.get('/', (req, res) => {
  res.send('VBCS Backend (Production Structure) is running!');
});

// 6. START THE SERVER & CONNECT TO DB
const startServer = async () => {
    await connectToDatabase(); // <-- NEW: Connect to MongoDB first
    app.listen(PORT, () => {
        console.log(`VBCS Backend server is running on http://localhost:${PORT}`);
    });
};

startServer(); // Run the function to start everything