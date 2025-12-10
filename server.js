/* ==========================================
   DIAGNOSTIC SERVER.JS - USE THIS TO TEST DB
   ========================================== */
const express = require('express');
const mongoose = require('mongoose');
const app = express();

// --- REPLACE THIS WITH YOUR REAL STRING ---
const MONGO_URI = "mongodb+srv://vbcs_admin:YOUR_REAL_PASSWORD_HERE@cluster0.mongodb.net/VBCS_DB?retryWrites=true&w=majority";

console.log("------------------------------------------------");
console.log("⏳ Attempting to connect to MongoDB...");
console.log("------------------------------------------------");

// Specific connection options to show errors faster
mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000 // Fail after 5 seconds instead of 10
})
.then(() => {
    console.log("✅✅✅ SUCCESS! MongoDB is Connected!");
    console.log("------------------------------------------------");
})
.catch(err => {
    console.log("❌❌❌ CONNECTION FAILED");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
    console.log("------------------------------------------------");
    console.log("HINT: Did you whitelist 0.0.0.0/0 in Network Access?");
    console.log("HINT: Is your password correct? (No special chars like @)");
});

app.get('/', (req, res) => res.send('Diagnostic Mode Active'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Diagnostic Server running on port ${PORT}`));