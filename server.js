/* ==================================================
   VBCS MASTER SERVER V12.34 (SMART CATEGORY HUB + FLUTTER AUTH)
   - Unified User Model
   - Added /api/auth for new Flutter App (JWT)
   - Added /api/emergency/sos Pipeline
   - Added /api/guardian/location/update (Stealth Engine)
   - Preserved all v9, v12, and Owner routes
   - INJECTED: V2 Extreme Auth Pipeline & JSON Catch-All
   - UPGRADED: Multi-Tenant Telegram Linking System
   - UPGRADED: Offline Command Queue (Ghost Trap Engine)
   - UPGRADED: Number Sanitizer & Directory Lookup Engine
   - INJECTED: V2 2FA Pipeline (TOTP + Backup Codes)
   ================================================== */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 
const crypto = require('crypto');
const path = require('path');
const http = require('http'); 
const { Server } = require("socket.io"); 
const multer = require('multer');       
const csv = require('csv-parser');      
const fs = require('fs');               
const { Readable } = require('stream'); 
const jwt = require('jsonwebtoken');

// 🔐 2FA DEPENDENCIES — run: npm install otplib qrcode bcryptjs
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app); 

// --- IMPORT UNIFIED USER MODEL ---
const User = require('./models/User');

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } 
}); 

app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

const io = new Server(server, { cors: { origin: "*" } }); 

app.use(express.json({ limit: '50mb' })); 
app.use(express.static(__dirname)); 

// DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://amenuil19_db_user:<db_password>@vbcs-dev.wemupsg.mongodb.net/?appName=VBCS-Dev";

mongoose.connect(MONGO_URI)
  .then(() => {
      console.log('✅ VBCS Engine: Ready & Connected');
      initAdmin(); 
  })
  .catch(err => console.error('❌ DB Error:', err.message));


// B. ADMIN SCHEMA
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: String,
    salt: String
});
adminSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};
adminSchema.methods.validatePassword = function(password) {
    if(!this.salt || !this.passwordHash) return false; 
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

async function initAdmin() {
    try {
        const admin = await Admin.findOne({ username: 'admin' });
        if (!admin) {
            const newAdmin = new Admin({ username: 'admin' });
            newAdmin.setPassword('admin123');
            await newAdmin.save();
            console.log("🔒 Default Admin Created");
        } 
        else if (!admin.salt || !admin.passwordHash) {
            await Admin.deleteOne({ username: 'admin' });
            const newAdmin = new Admin({ username: 'admin' });
            newAdmin.setPassword('admin123');
            await newAdmin.save();
            console.log("🔒 Admin account repaired.");
        }
    } catch (e) { console.error("Admin Init Error:", e.message); }
}

// C. OTHER SCHEMAS
const DirectoryEntry = mongoose.models.DirectoryEntry || mongoose.model('DirectoryEntry', new mongoose.Schema({
    companyName: String, phoneNumber: String, category: String, 
    email: String, officeAddress: String, isVerified: { type: Boolean, default: true },
    status: { type: String, default: 'Active' }
}));

const SpamReport = mongoose.models.SpamReport || mongoose.model('SpamReport', new mongoose.Schema({
    reportedNumber: String, reporterPhone: String, reason: String, comments: String, createdAt: { type: Date, default: Date.now }
}));

const SuspiciousNumber = mongoose.models.SuspiciousNumber || mongoose.model('SuspiciousNumber', new mongoose.Schema({
    phoneNumber: String, reportCount: { type: Number, default: 0 }, status: { type: String, default: 'Warning' }
}));

const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({
    title: String, body: String, date: { type: Date, default: Date.now }
}));

// 🚨 NEW: TELEGRAM MULTI-TENANT LINKING SCHEMA
const TelegramLink = mongoose.models.TelegramLink || mongoose.model('TelegramLink', new mongoose.Schema({
    chatId: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true }
}));

// 🚨 NEW: OFFLINE COMMAND QUEUE SCHEMA
const CommandQueue = mongoose.models.CommandQueue || mongoose.model('CommandQueue', new mongoose.Schema({
    phoneNumber: { type: String, required: true },
    command: { type: String, required: true },
    status: { type: String, default: 'pending' }, // 'pending' or 'executed'
    createdAt: { type: Date, default: Date.now }
}));

// ==========================================
// NEW FLUTTER API ROUTES (V13)
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { phone, pin, email } = req.body;
        
        let user = await User.findOne({ phoneNumber: phone });
        if (user) return res.status(400).json({ message: 'Phone number is already registered.' });

        user = new User({ phoneNumber: phone, email: email });
        user.setPassword(pin); 
        await user.save();

        res.status(201).json({ message: 'Device registered successfully.' });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, pin } = req.body;

        const user = await User.findOne({ phoneNumber: phone });
        if (!user || !user.validatePassword(pin)) {
            return res.status(400).json({ message: 'Invalid phone number or PIN.' });
        }

        const token = jwt.sign(
            { userId: user._id, phone: user.phoneNumber }, 
            process.env.JWT_SECRET || 'tele_guardian_super_secret_key', 
            { expiresIn: '30d' }
        );

        res.status(200).json({ token, message: 'Login successful' });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// ==========================================
// NEW FLUTTER V2 EXTREME AUTH PIPELINE
// ==========================================
const tempOtpStore = {}; 

app.post('/api/auth/v2/register-init', async (req, res) => {
    try {
        const { phone, email } = req.body;
        let user = await User.findOne({ phoneNumber: phone });
        if (user) return res.status(400).json({ success: false, message: 'Phone number is already registered.' });

        const otp = "123456"; 
        tempOtpStore[email] = { phone, otp }; 

        console.log(`📧 EMAIL SENT TO ${email}: Your TeleGuardian OTP is ${otp}`);
        res.status(200).json({ success: true, message: 'OTP sent successfully.' });
    } catch (err) {
        console.error('V2 Init Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.post('/api/auth/v2/register-complete', async (req, res) => {
    try {
        const { email, otp, pin } = req.body;
        const storedData = tempOtpStore[email];

        if (!storedData || storedData.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
        }

        let user = new User({ phoneNumber: storedData.phone, email: email });
        user.setPassword(pin);
        await user.save();

        delete tempOtpStore[email]; 

        const token = jwt.sign(
            { userId: user._id, phone: user.phoneNumber }, 
            process.env.JWT_SECRET || 'tele_guardian_super_secret_key', 
            { expiresIn: '30d' }
        );

        res.status(201).json({ success: true, message: 'Vault Key Secured.', token });
    } catch (err) {
        console.error('V2 Complete Error:', err);
        res.status(500).json({ success: false, message: 'Server error during verification.' });
    }
});

// 🔐 UPGRADED V2 LOGIN — now handles TOTP and backup code verification
app.post('/api/auth/v2/login', async (req, res) => {
    try {
        const { phone, pin, totpCode, backupCode } = req.body;
        const user = await User.findOne({ phoneNumber: phone });
        
        if (!user || !user.validatePassword(pin)) {
            return res.status(400).json({ success: false, message: 'Invalid phone number or PIN.' });
        }

        // If 2FA is enabled, require a TOTP or backup code
        if (user.twofa_enabled) {
            // Case 1: No code provided at all — tell Flutter to show the 2FA screen
            if (!totpCode && !backupCode) {
                return res.status(403).json({
                    success: false,
                    requires2FA: true,
                    message: '2FA code required.'
                });
            }

            // Case 2: TOTP code provided — verify it
            if (totpCode) {
                const secret = user.twofa_secret;
                if (!secret) {
                    return res.status(500).json({ success: false, message: '2FA secret not found. Please re-enable 2FA.' });
                }
                const isValid = authenticator.verify({ token: totpCode, secret });
                if (!isValid) {
                    return res.status(401).json({ success: false, message: 'Invalid authenticator code.' });
                }
            }

            // Case 3: Backup code provided — find and consume it
            if (backupCode) {
                const storedCodes = user.twofa_backup_codes || [];
                const matchedIndex = storedCodes.findIndex(hash => bcrypt.compareSync(backupCode, hash));
                if (matchedIndex === -1) {
                    return res.status(401).json({ success: false, message: 'Invalid backup code.' });
                }
                // Consume the used backup code so it can't be reused
                storedCodes.splice(matchedIndex, 1);
                await User.updateOne(
                    { _id: user._id },
                    { $set: { twofa_backup_codes: storedCodes } },
                    { strict: false }
                );
                // Issue the token and flag that a backup code was used
                const token = jwt.sign(
                    { userId: user._id, phone: user.phoneNumber },
                    process.env.JWT_SECRET || 'tele_guardian_super_secret_key',
                    { expiresIn: '30d' }
                );
                return res.status(200).json({
                    success: true,
                    message: 'Login successful',
                    token,
                    requires2FA: false,
                    usedBackupCode: true
                });
            }
        }

        // All checks passed — issue JWT
        const token = jwt.sign(
            { userId: user._id, phone: user.phoneNumber }, 
            process.env.JWT_SECRET || 'tele_guardian_super_secret_key', 
            { expiresIn: '30d' }
        );

        res.status(200).json({ success: true, message: 'Login successful', token, requires2FA: false });
    } catch (err) {
        console.error('V2 Login Error:', err);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// ==========================================
// 🔐 V2 2FA PIPELINE
// ==========================================

// --- GENERATE 2FA SECRET + QR CODE ---
// Called when user taps "Enable 2FA" in settings.
// Saves a TEMP secret (not activated yet) and returns the QR code image.
app.post('/api/auth/v2/2fa/generate', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: 'Phone number required.' });

        const user = await User.findOne({ phoneNumber: phone });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Generate a fresh cryptographically secure secret
        const secret = authenticator.generateSecret(32);

        // Build the otpauth URI — this is what encodes into the QR code
        // Format: otpauth://totp/AppName:identifier?secret=SECRET&issuer=AppName
        const otpauth = authenticator.keyuri(phone, 'TeleGuardian', secret);

        // Generate QR code as a base64 data URL so Flutter can render it directly
        const qrCodeDataUrl = await qrcode.toDataURL(otpauth, {
            errorCorrectionLevel: 'H', // High error correction = more scannable
            type: 'image/png',
            width: 300,               // Large enough to scan reliably
            margin: 2,
        });

        // Save the temp secret — NOT activated until user verifies their first code
        await User.updateOne(
            { _id: user._id },
            { $set: { twofa_secret_temp: secret, twofa_enabled: false } },
            { strict: false }
        );

        console.log(`🔐 2FA QR generated for ${phone}`);
        res.status(200).json({
            secret,           // shown as manual fallback in the app
            qrCode: qrCodeDataUrl  // base64 PNG rendered by Flutter
        });
    } catch (err) {
        console.error('2FA Generate Error:', err);
        res.status(500).json({ error: 'Failed to generate 2FA keys.' });
    }
});

// --- ENABLE 2FA (verify first code + activate) ---
// User scanned the QR and entered their first 6-digit code.
// We verify it against the TEMP secret, then promote it to the real secret.
app.post('/api/auth/v2/2fa/enable', async (req, res) => {
    try {
        const { phone, token } = req.body;
        if (!phone || !token) return res.status(400).json({ success: false, message: 'Phone and token required.' });

        const user = await User.findOne({ phoneNumber: phone });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const secret = user.twofa_secret_temp;
        if (!secret) {
            return res.status(400).json({ success: false, message: 'No pending 2FA setup found. Please generate a new QR code.' });
        }

        // Verify the code against the temp secret
        const isValid = authenticator.verify({ token, secret });
        if (!isValid) {
            return res.status(400).json({ success: false, message: 'Invalid code. Please try again.' });
        }

        // Generate 8 one-time backup codes
        const rawBackupCodes = Array.from({ length: 8 }, () =>
            crypto.randomBytes(4).toString('hex') // e.g. "a1b2c3d4"
        );
        // Hash them before storing — same principle as password hashing
        const hashedBackupCodes = rawBackupCodes.map(code => bcrypt.hashSync(code, 10));

        // Promote temp secret to real secret and activate 2FA
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    twofa_secret: secret,
                    twofa_secret_temp: null,
                    twofa_enabled: true,
                    twofa_backup_codes: hashedBackupCodes
                }
            },
            { strict: false }
        );

        console.log(`✅ 2FA ENABLED for ${phone}`);
        res.status(200).json({
            success: true,
            message: '2FA enabled successfully.',
            backupCodes: rawBackupCodes // shown ONCE to user — never stored in plaintext again
        });
    } catch (err) {
        console.error('2FA Enable Error:', err);
        res.status(500).json({ success: false, message: 'Server error enabling 2FA.' });
    }
});

// --- DISABLE 2FA ---
// Requires a valid current TOTP code to prevent someone disabling 2FA without the device.
app.post('/api/auth/v2/2fa/disable', async (req, res) => {
    try {
        const { phone, token } = req.body;
        if (!phone || !token) return res.status(400).json({ success: false, message: 'Phone and token required.' });

        const user = await User.findOne({ phoneNumber: phone });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        if (!user.twofa_enabled) {
            return res.status(400).json({ success: false, message: '2FA is not enabled on this account.' });
        }

        const isValid = authenticator.verify({ token, secret: user.twofa_secret });
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid authenticator code.' });
        }

        // Wipe all 2FA data
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    twofa_secret: null,
                    twofa_secret_temp: null,
                    twofa_enabled: false,
                    twofa_backup_codes: []
                }
            },
            { strict: false }
        );

        console.log(`🔓 2FA DISABLED for ${phone}`);
        res.status(200).json({ success: true, message: '2FA disabled successfully.' });
    } catch (err) {
        console.error('2FA Disable Error:', err);
        res.status(500).json({ success: false, message: 'Server error disabling 2FA.' });
    }
});

// ==========================================
// EMERGENCY & SAFETY ROUTES
// ==========================================
app.post('/api/emergency/sos', async (req, res) => {
    try {
        const { phone, latitude, longitude } = req.body;

        if (!phone || !latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'Missing SOS data' });
        }
        
        const user = await User.findOne({ phoneNumber: phone });
        if(user && user.circle) {
             user.circle.forEach(member => {
                 io.to(member.phone).emit('sos_alert', { 
                     fromName: user.fullName || phone, 
                     lat: latitude, 
                     lng: longitude 
                 });
             });
        }
        
        res.status(200).json({ success: true, message: 'SOS Broadcasted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during SOS' });
    }
});

// 🚨 DOUBLE NET: CATCH REST API GPS UPDATES
app.post('/api/guardian/location/update', async (req, res) => {
    try {
        const { phone, lat, lng, battery } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'No phone provided' });

        console.log(`📡 [REST API] Received coordinates from ${phone}`);

        const link = await TelegramLink.findOne({ phoneNumber: phone });
        if (link) {
            // UPDATED: Universal Google Maps link
            const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
            bot.sendMessage(
                link.chatId, 
                `📍 *Target Acquired!* [API]\n🔋 Battery: ${battery || 100}%\n🗺️ Maps Link:\n${mapsLink}`,
                { parse_mode: "Markdown" }
            ).catch(err => console.error("Telegram API Send Error:", err)); 
        }

        await User.findOneAndUpdate(
            { phoneNumber: phone },
            { location: { lat, lng, updatedAt: new Date() }, batteryLevel: battery || 100 },
            { new: true }
        );

        io.emit('friend_moved', { phone, lat, lng, battery });
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Stealth Ping Error:', error.message);
        res.status(500).json({ success: false });
    }
});
// 📸 INTRUDER SELFIE PIPELINE
app.post('/api/guardian/intruder', upload.single('photo'), async (req, res) => {
    try {
        const { phone } = req.body;
        const photo = req.file;

        if (!phone || !photo) return res.status(400).json({ success: false, message: 'Missing data' });

        const link = await TelegramLink.findOne({ phoneNumber: phone });
        if (link) {
            // Forward the image buffer directly to Telegram
            await bot.sendPhoto(link.chatId, photo.buffer, { 
                caption: `🚨 *INTRUDER ALERT!*\n3 Failed PIN attempts on device: ${phone}`,
                parse_mode: 'Markdown'
            });
        }
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Intruder Upload Error:', error);
        res.status(500).json({ success: false });
    }
});

// ==========================================
// 🚨 PHASE 7: MULTI-TENANT TELEGRAM BOT 🚨
// ==========================================
const TelegramBot = require('node-telegram-bot-api');
const token = '8498461586:AAE_2jDGU9BcQvcL2bDpZFevYBY1FzWPj88';
const bot = new TelegramBot(token, { polling: true });
console.log("🤖 Multi-Tenant Telegram Bot: ONLINE");

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🛡️ *TeleGuardian Secure Terminal*\n\nTo control your device, you must securely link it to this chat.\n\nReply with:\n`/link [YourPhone] [YourAppPIN]`\n\nExample: `/link +251911234567 1234`", {parse_mode: "Markdown"});
});

bot.onText(/\/link (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const phone = match[1].trim();
    const pin = match[2].trim();

    try {
        const user = await User.findOne({ phoneNumber: phone });
        if (!user || !user.validatePassword(pin)) {
            return bot.sendMessage(chatId, "❌ Authentication Failed. Invalid Phone Number or PIN.");
        }

        await TelegramLink.findOneAndUpdate(
            { chatId: chatId },
            { phoneNumber: phone },
            { upsert: true, new: true }
        );

        bot.sendMessage(chatId, `✅ *Device Linked Successfully!*\n\nYou can now command device: ${phone}\n\nAvailable commands:\n/locate - Force GPS Ping\n/siren - Detonate Alarm\n/selfie - Stealth Camera Capture\n/wipe - Lock Device\n/lostmode - Full Lockdown`, {parse_mode: "Markdown"});
    } catch (error) {
        bot.sendMessage(chatId, "❌ Database error during linking.");
    }
});

bot.onText(/\/locate/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const link = await TelegramLink.findOne({ chatId: chatId });
    if (!link) return bot.sendMessage(chatId, "⚠️ You have not linked a device. Reply with `/link [Phone] [PIN]` first.");

    await CommandQueue.create({ phoneNumber: link.phoneNumber, command: 'force_locate' });
    bot.sendMessage(chatId, `🛰️ Ping sent to ${link.phoneNumber}. (Queued if offline)`);
    
    // 🚨 FIX: Removed object payload to prevent Flutter JSON parse crash
    io.to(link.phoneNumber).emit('force_locate');
});

bot.onText(/\/siren/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const link = await TelegramLink.findOne({ chatId: chatId });
    if (!link) return bot.sendMessage(chatId, "⚠️ Please /link your device first.");

    await CommandQueue.create({ phoneNumber: link.phoneNumber, command: 'force_siren' });
    bot.sendMessage(chatId, `🚨 DETONATING ALARM ON ${link.phoneNumber}. (Queued if offline)`);
    
    // 🚨 FIX: Pure emit command for Flutter
    io.to(link.phoneNumber).emit('force_siren');
});

bot.onText(/\/wipe/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const link = await TelegramLink.findOne({ chatId: chatId });
    if (!link) return bot.sendMessage(chatId, "⚠️ Please /link your device first.");

    await CommandQueue.create({ phoneNumber: link.phoneNumber, command: 'force_wipe' });
    bot.sendMessage(chatId, `☢️ WARNING: NUCLEAR PROTOCOL AUTHORIZED ON ${link.phoneNumber}. (Queued if offline)`);
    
    // 🚨 FIX: Pure emit command for Flutter
    io.to(link.phoneNumber).emit('force_wipe');
});

bot.onText(/\/lostmode/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const link = await TelegramLink.findOne({ chatId: chatId });
    if (!link) return bot.sendMessage(chatId, "⚠️ Please /link your device first.");

    // 🚨 UPGRADE: Added Lost Mode to the Offline Queue
    await CommandQueue.create({ phoneNumber: link.phoneNumber, command: 'force_lost_mode' });
    bot.sendMessage(chatId, `🔒 LOST MODE ACTIVATED for ${link.phoneNumber}.\nSiren engaged, GPS locked, and device flagged as lost. (Queued if offline)`);

    // 🚨 FIX: Pure emit command for Flutter
    io.to(link.phoneNumber).emit('force_lost_mode');
});
// 🚨 TELEGRAM COMMAND: LOST MODE
bot.onText(/\/lostmode/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const link = await TelegramLink.findOne({ chatId: chatId });
    
    if (!link) {
        return bot.sendMessage(chatId, "⚠️ Please /link your device first.");
    }

    // Save to Offline Queue
    await CommandQueue.create({ phoneNumber: link.phoneNumber, command: 'force_lost_mode' });
    
    // Reply to Telegram
    bot.sendMessage(chatId, `🔒 LOST MODE ACTIVATED for ${link.phoneNumber}.\nSiren engaged, GPS locked, and device flagged as lost.`);

    // Fire the silent trigger to the phone
    io.to(link.phoneNumber).emit('force_lost_mode');
});
// 📸 TELEGRAM COMMAND: STEALTH SELFIE
bot.onText(/\/selfie/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const link = await TelegramLink.findOne({ chatId: chatId });
    
    if (!link) return bot.sendMessage(chatId, "⚠️ Please /link your device first.");

    // Save to Offline Queue in case the phone is currently disconnected
    await CommandQueue.create({ phoneNumber: link.phoneNumber, command: 'force_selfie' });
    
    bot.sendMessage(chatId, `📸 Requesting stealth selfie from ${link.phoneNumber}... (Queued if offline)`);

    // Fire the silent trigger to the phone
    io.to(link.phoneNumber).emit('force_selfie');
});

// ==========================================
// REAL-TIME ENGINE & OFFLINE QUEUE DETONATOR
// ==========================================
io.on('connection', (socket) => {
    
    socket.on('join_room', async (phone) => { 
        socket.join(phone); 
        console.log(`📱 Device joined secure room: ${phone}`);

        // 🚨 THE GHOST TRAP: CHECK FOR OFFLINE COMMANDS
        try {
            const pendingCommands = await CommandQueue.find({ phoneNumber: phone, status: 'pending' });
            
            if (pendingCommands.length > 0) {
                console.log(`⚡ TRAP TRIGGERED: Executing ${pendingCommands.length} offline commands for ${phone}`);
                
                for (let cmd of pendingCommands) {
                    // 🚨 FIX: Pure emit command without payloads
                    socket.emit(cmd.command);
                    
                    cmd.status = 'executed';
                    await cmd.save();
                }
            }
        } catch (err) {
            console.error("Queue Check Error:", err);
        }
    });

    // 🚨 DOUBLE NET: CATCH SOCKET GPS UPDATES
    socket.on('ping_location', async (data) => {
        try {
            socket.broadcast.emit('friend_moved', data);

            const link = await TelegramLink.findOne({ phoneNumber: data.phone });
            if (link) {
                // UPDATED: Universal Google Maps link
                const mapsLink = `https://www.google.com/maps?q=${data.lat},${data.lng}`;
                bot.sendMessage(
                    link.chatId, 
                    `📍 *Target Acquired!* [Socket]\n🔋 Battery: ${data.battery || 100}%\n🗺️ Maps Link:\n${mapsLink}`,
                    { parse_mode: "Markdown" }
                ).catch(err => console.error("Telegram Socket Send Error:", err)); 
            }

            const user = await User.findOneAndUpdate(
                { phoneNumber: data.phone }, 
                { location: { lat: data.lat, lng: data.lng, updatedAt: new Date() }, batteryLevel: data.battery },
                { new: true }
            );

        } catch (e) { 
            console.error("Socket Ping DB Error:", e); 
        }
    });

    socket.on('trigger_sos', async (data) => {
        const user = await User.findOne({ phoneNumber: data.phone });
        if(user && user.circle) {
             user.circle.forEach(member => {
                 io.to(member.phone).emit('sos_alert', { fromName: user.fullName, lat: data.lat, lng: data.lng });
             });
        }
    });
});

// ==========================================
// LEGACY API ROUTES (MOBILE APP - v9)
// ==========================================
app.post('/api/v9/auth/otp-request', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) return res.status(400).json({ success: false, message: "Phone required" });
        const otp = "123456"; 
        let user = await User.findOne({ phoneNumber });
        if (!user) user = new User({ phoneNumber });
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60000); 
        await user.save();
        res.json({ success: true, testCode: otp }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/v9/auth/otp-verify', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user || user.otp !== code) return res.status(400).json({ success: false, message: "Invalid OTP" });
        user.otp = null; 
        let nextStep = 'home';
        if (user.onboardingStep < 2 && !user.fullName) nextStep = 'wizard'; 
        await user.save();
        const userLite = user.toObject();
        delete userLite.passwordHash; delete userLite.salt; 
        res.json({ success: true, nextStep, user: userLite });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/v9/auth/login', async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(400).json({ success: false, message: "User not found" });
        const isValid = await user.validatePassword(password);
        if (!isValid) return res.status(400).json({ success: false, message: "Invalid Password" });
        const userLite = user.toObject();
        delete userLite.passwordHash; delete userLite.salt;
        res.json({ success: true, user: userLite });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/v9/onboarding/personal', async (req, res) => {
    try {
        await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { ...req.body, onboardingStep: 4 });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});


// 🚨🚨🚨 COMMENTED OUT TO PREVENT ROUTE COLLISION 🚨🚨🚨
/*
app.post('/api/v12/guardian/invite/generate', async (req, res) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await User.findOneAndUpdate({ phoneNumber: req.body.phoneNumber }, { inviteCode: code });
    res.json({ success: true, code });
});

app.post('/api/v9/guardian/join', async (req, res) => {
    const { myPhone, inviteCode } = req.body;
    const target = await User.findOne({ inviteCode });
    const me = await User.findOne({ phoneNumber: myPhone });
    if(!target) return res.status(404).json({message: "Invalid Code"});
    if(!me.circle.some(c=>c.phone===target.phoneNumber)) me.circle.push({phone:target.phoneNumber, name:target.fullName});
    if(!target.circle.some(c=>c.phone===me.phoneNumber)) target.circle.push({phone:me.phoneNumber, name:me.fullName});
    await me.save(); await target.save();
    res.json({ success: true, targetName: target.fullName });
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    const me = await User.findOne({ phoneNumber: req.query.phone });
    if (!me) return res.json({ circle: [] });
    const phones = me.circle.map(c => c.phone);
    const members = await User.find({ phoneNumber: { $in: phones } }).select('fullName phoneNumber location profilePic batteryLevel');
    const data = members.map(u => ({
        name: u.fullName, phone: u.phoneNumber, lat: u.location?.lat, lng: u.location?.lng, pic: u.profilePic, battery: u.batteryLevel
    }));
    res.json({ success: true, circle: data, myCode: me.inviteCode });
});
*/


// ==========================================
// THE CIRCLE PAIRING ROUTES (UPGRADED)
// ==========================================
app.post('/api/v12/guardian/invite/generate', async (req, res) => {
    try {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        // 🚨 FIX: { strict: false } forces Mongoose to save the code even if it's missing from the Schema
        const updated = await User.findOneAndUpdate(
            { phoneNumber: req.body.phoneNumber }, 
            { $set: { inviteCode: code } },
            { new: true, strict: false } 
        );
        
        if (!updated) return res.status(404).json({ success: false, message: "User not found in DB." });
        res.json({ success: true, code });
    } catch (e) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post('/api/v9/guardian/join', async (req, res) => {
    try {
        const { myPhone, inviteCode } = req.body;
        
        // 1. Find both users
        const target = await User.findOne({ inviteCode: inviteCode });
        const me = await User.findOne({ phoneNumber: myPhone });
        
        if(!target) return res.status(404).json({success: false, message: "Invalid or expired code."});
        if(!me) return res.status(404).json({success: false, message: "Your account was not found."});
        
        // 2. Safely initialize the circle arrays (prevents crashes if they are empty)
        let meCircle = me.circle || [];
        let targetCircle = target.circle || [];

        // 3. Add each other to their respective circles
        if(!meCircle.some(c => c.phone === target.phoneNumber)) {
            meCircle.push({ phone: target.phoneNumber, name: target.fullName || 'Family Member' });
        }
        if(!targetCircle.some(c => c.phone === me.phoneNumber)) {
            targetCircle.push({ phone: me.phoneNumber, name: me.fullName || 'Family Member' });
        }

        // 4. Force save the arrays to the database
        await User.updateOne({ _id: me._id }, { $set: { circle: meCircle } }, { strict: false });
        
        // 🚨 SECURITY: Once used, the code is destroyed so it can't be used twice by a thief
        await User.updateOne({ _id: target._id }, { $set: { circle: targetCircle, inviteCode: null } }, { strict: false });

        res.json({ success: true, targetName: target.fullName || 'Family Member' });
    } catch (e) {
        console.error("Join error:", e);
        res.status(500).json({ success: false, message: "Server crash during pairing." });
    }
});

app.get('/api/v9/guardian/circle', async (req, res) => {
    try {
        const me = await User.findOne({ phoneNumber: req.query.phone });
        if (!me) return res.json({ circle: [] });
        
        const phones = (me.circle || []).map(c => c.phone);
        const members = await User.find({ phoneNumber: { $in: phones } }).select('fullName phoneNumber location profilePic batteryLevel');
        
        const data = members.map(u => ({
            name: u.fullName || 'Family Member', 
            phone: u.phoneNumber, 
            lat: u.location?.lat, 
            lng: u.location?.lng, 
            pic: u.profilePic, 
            battery: u.batteryLevel
        }));
        
        res.json({ success: true, circle: data, myCode: me.inviteCode || 'GENERATE' });
    } catch (e) {
        res.json({ circle: [] });
    }
});

// --- CORE ROUTES (v12) ---

// 🛡️ THE UPGRADED SMART NUMBER SANITIZER (GLOBAL EDITION)
function sanitizePhone(input) {
    // Preserve the '+' if the user typed it, otherwise strip non-digits
    let hasPlus = input.trim().startsWith('+');
    let cleaned = input.replace(/\D/g, '');
    
    if (hasPlus) return '+' + cleaned;

    // Handle standard international dialing prefix '00' (e.g., 001 -> +1, 0044 -> +44)
    if (cleaned.startsWith('00')) return '+' + cleaned.substring(2);

    // Handle local Ethiopian numbers starting with '0' (09, 07, 011, etc.)
    if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
        return '+251' + cleaned.substring(1);
    }

    // Handle numbers that were submitted with the 251 country code directly
    if (cleaned.startsWith('251') && cleaned.length >= 11) {
        return '+' + cleaned;
    }

    // If it has no prefix (e.g., raw US 14155552671), append the + to treat it globally
    return '+' + cleaned;
}

app.get('/api/v12/lookup/:number', async (req, res) => {
    try {
        const rawNumber = req.params.number;
        const cleanNumber = sanitizePhone(rawNumber);
        
        console.log(`🔍 Directory Search: Raw [${rawNumber}] -> Sanitized [${cleanNumber}]`);

        // 1. Check Verified Enterprise Directory
        const verified = await DirectoryEntry.findOne({ phoneNumber: cleanNumber });
        if (verified) {
            return res.json({ 
                status: 'verified', 
                msg: "Verified Enterprise", 
                data: verified 
            });
        }
        
        // 2. Check Scam/Spam Reports
        const suspect = await SuspiciousNumber.findOne({ phoneNumber: cleanNumber });
        if (suspect && suspect.reportCount >= 10) {
            return res.json({ 
                status: 'danger', 
                msg: "High Scam Risk",
                reports: suspect.reportCount 
            });
        }
        
        // 3. Not Found (Trigger the warning UI in Flutter)
        res.json({ 
            status: 'unknown', 
            msg: "This number does not belong to a verified Ethio Telecom enterprise.",
            cleanNumber: cleanNumber
        });
    } catch (err) {
        res.status(500).json({ status: 'error', msg: "Lookup Engine Error" });
    }
});

app.post('/api/v12/report', async (req, res) => {
    try {
        const { reportedNumber } = req.body;
        await new SpamReport(req.body).save();
        const count = await SpamReport.countDocuments({ reportedNumber });
        await SuspiciousNumber.findOneAndUpdate(
            { phoneNumber: reportedNumber },
            { reportCount: count, status: count >= 10 ? 'Blocked' : 'Warning' },
            { upsert: true }
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

app.get('/api/v12/categories', async (req, res) => {
    try {
        const stats = await DirectoryEntry.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { _id: 1 } } 
        ]);
        const result = stats.map(s => ({ name: s._id || "Other", count: s.count }));
        if(result.length === 0) return res.json([{name: "Directory Empty", count: 0}]);
        res.json(result);
    } catch (e) {
        res.json([{name: "Bank", count:0}, {name: "Emergency", count:0}]);
    }
});

app.get('/api/v12/directory/category/:name', async (req, res) => {
    try {
        const catName = req.params.name;
        const list = await DirectoryEntry.find({ 
            category: { $regex: new RegExp("^" + catName + "$", "i") } 
        }).sort({ companyName: 1 });
        res.json(list);
    } catch (e) { res.json([]); }
});

app.get('/api/v12/directory/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === "") return res.json(await DirectoryEntry.find().limit(20));

        const regex = new RegExp(q, 'i');
        const results = await DirectoryEntry.find({
            $or: [
                { companyName: regex },
                { phoneNumber: regex },
                { category: regex }
            ]
        }).limit(50);
        res.json(results);
    } catch (e) { res.json([]); }
});

// ==========================================
// 7. OWNER / ADMIN ROUTES (V1)
// ==========================================
const ownerRouter = express.Router();

ownerRouter.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin || !admin.validatePassword(password)) {
        return res.status(401).json({ success: false, message: "Invalid Credentials" });
    }
    res.json({ success: true, token: 'session_token' });
});

ownerRouter.post('/change-password', async (req, res) => {
    const { username, newPassword } = req.body;
    const admin = await Admin.findOne({ username });
    if (admin) {
        admin.setPassword(newPassword);
        await admin.save();
        res.json({ success: true, message: "Password Updated" });
    } else {
        res.status(404).json({ success: false, message: "Admin not found" });
    }
});

ownerRouter.get('/stats', async (req, res) => {
    try {
        const b2c = await User.countDocuments({ role: 'subscriber' });
        const b2b = await User.countDocuments({ role: 'enterprise' });
        const reports = await SpamReport.countDocuments();
        res.json({ 
            totalMonthlyRevenue: b2c * 50 + b2b * 500, 
            totalEnterprises: b2b, 
            totalB2CSubscribers: b2c, 
            spamReports: reports 
        });
    } catch(e) { res.json({ success: false }); }
});

ownerRouter.get('/subscribers/:type', async (req, res) => {
    try {
        const role = req.params.type === 'b2b' ? 'enterprise' : 'subscriber';
        if (mongoose.connection.readyState !== 1) {
            return res.json([]); 
        }
        const users = await User.find({ role }).sort({ createdAt: -1 }).limit(100);
        res.json(users || []); 
    } catch (e) {
        console.error("Fetch Error:", e);
        res.json([]); 
    }
});

ownerRouter.get('/directory', async (req, res) => {
    const list = await DirectoryEntry.find().sort({ companyName: 1 });
    res.json(list);
});

// 🛡️ THE NEW SMART HEURISTIC CSV PARSER (GLOBAL EDITION)
ownerRouter.post('/directory-upload', upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({ message: "No file found" });
    
    const stream = Readable.from(req.file.buffer.toString('utf8'));
    let entries = [];

    // Helper to intelligently format numbers globally
    const forceInternational = (phone) => {
        let hasPlus = phone.trim().startsWith('+');
        let digits = phone.replace(/\D/g, ''); 
        
        if (hasPlus) return '+' + digits;
        if (digits.startsWith('00')) return '+' + digits.substring(2);
        if (digits.startsWith('0') && !digits.startsWith('00')) return '+251' + digits.substring(1); 
        if (digits.startsWith('251') && digits.length >= 11) return '+' + digits;
        return '+' + digits; 
    };

    stream
        .pipe(csv({ headers: false })) // Completely ignore Excel headers!
        .on('data', (row) => {
            // Convert messy CSV row into a clean array
            const cols = Object.values(row).map(c => c ? c.toString().trim() : '');
            
            // Hunt for a column containing a valid phone length (9 to 15 digits for global numbers)
            let phoneColIndex = cols.findIndex(c => {
                let digits = c.replace(/\D/g, '');
                return digits.length >= 9 && digits.length <= 15;
            });
            
            if (phoneColIndex !== -1 && phoneColIndex > 0) {
                let phone = forceInternational(cols[phoneColIndex]);
                
                // Hunt backwards for the Enterprise Name
                let name = "";
                for(let i = phoneColIndex - 1; i >= 0; i--) {
                    let colText = cols[i].toLowerCase();
                    if (cols[i].length > 3 && !colText.includes('name') && !colText.includes('number') && !colText.includes('telephone')) {
                        name = cols[i];
                        break;
                    }
                }
                
                if (name) {
                    entries.push({
                        companyName: name,
                        phoneNumber: phone,
                        category: "Verified Enterprise" // Safe fallback category
                    });
                }
            }
        })
        .on('end', async () => {
            try {
                if(entries.length === 0) return res.json({ success: false, message: "No valid phone numbers found in file." });
                await DirectoryEntry.insertMany(entries, { ordered: false });
                res.json({ success: true, message: `Successfully extracted and imported ${entries.length} enterprises globally!` });
            } catch (e) {
                const count = e.writeErrors ? entries.length - e.writeErrors.length : 0;
                res.json({ success: true, message: `Successfully imported ${count} new enterprises! (Skipped duplicates)` });
            }
        })
        .on('error', () => res.status(400).json({ message: "Bad CSV Format" }));
});

ownerRouter.post('/broadcast', async (req, res) => {
    const { title, body } = req.body;
    await Notification.create({ title, body });
    io.emit('global_alert', { title, body }); 
    res.json({ success: true });
});

ownerRouter.get('/fraud-reports', async (req, res) => {
    const reports = await SpamReport.find().sort({ createdAt: -1 }).limit(50);
    const mapped = reports.map(r => ({
        number: r.reportedNumber || r.phoneNumber,
        reportedNumber: r.reportedNumber || r.phoneNumber,
        reason: r.reason,
        comments: r.comments,
        createdAt: r.createdAt
    }));
    res.json(mapped);
});

ownerRouter.post('/suspend-number', async (req, res) => {
    const { number } = req.body;
    await SuspiciousNumber.findOneAndUpdate(
        { phoneNumber: number },
        { status: 'Blocked', reportCount: 999 },
        { upsert: true }
    );
    res.json({ success: true });
});

app.use('/api/v1/owner', ownerRouter);

// ==========================================
// 🛡️ JSON CATCH-ALL (PREVENTS HTML CRASHES)
// ==========================================
app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, message: `Route does not exist: ${req.originalUrl}` });
});

app.get('/', (req, res) => { res.send("<h1>Server is Running</h1>"); });
app.get('*', (req, res) => { res.status(404).send("<h1>404 Not Found</h1>"); });

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => { console.log(`🚀 V12.34 Server Running on Port ${PORT}`); });