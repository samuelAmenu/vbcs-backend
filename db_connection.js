const mongoose = require('mongoose');

// --- THIS IS WHERE YOUR SECRET KEY GOES ---
const MONGO_DB_URL = "mongodb+srv://amenuil19_db_user:ehs04IyMn9Uz3S5P@vbcs-project.7far1jp.mongodb.net/?appName=VBCS-Project";


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