const mongoose = require('mongoose');

// --- THIS IS WHERE YOUR SECRET KEY GOES ---
// REPLACE WITH THIS:
const MONGO_DB_URL = process.env.MONGO_DB_URL;

const connectToDatabase = async () => {
  try {
    await mongoose.connect(MONGO_DB_URL);
    console.log('✅ Successfully connected to the VBCS MongoDB Atlas database!');
  } catch (error) {
    console.error('❌ ERROR: Could not connect to the database.');
    console.error(error.message);
    process.exit(1); // Exit the app if we can't connect
  }
};

module.exports = connectToDatabase;