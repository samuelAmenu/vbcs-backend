const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    // --- Core Identity ---
    phoneNumber: { type: String, required: true, unique: true, index: true },
    email: { type: String },
    
    // --- Extreme Security (Phase 4) ---
    passwordHash: String,
    salt: String,
    otp: String,              // Legacy OTP
    otpExpires: Date,         // Legacy OTP Expiry
    registrationOtp: String,  // NEW: Secure Email verification code
    isEmailVerified: { type: Boolean, default: false },  // NEW: Email lock
    termsAcceptedAt: Date,    // NEW: Legal Compliance Audit
    privacyAcceptedAt: Date,  // NEW: Legal Compliance Audit

    // --- 2FA / TOTP FIELDS ---
    // These must match the field names used in server.js exactly
    twofa_enabled:      { type: Boolean, default: false }, // Is 2FA active for this user?
    twofa_secret:       { type: String, default: null },   // Live TOTP secret (post-verification)
    twofa_secret_temp:  { type: String, default: null },   // Temp secret during setup (pre-verification)
    twofa_backup_codes: { type: [String], default: [] },   // Hashed one-time backup codes
    
    // --- Roles & Profile ---
    role: { type: String, enum: ['subscriber', 'enterprise', 'admin'], default: 'subscriber' },
    companyName: String, 
    fullName: { type: String, default: 'Subscriber' },
    profilePic: String, 
    imei: String,
    
    // --- Tele Guardian Features ---
    circle: [{ phone: String, name: String, status: { type: String, default: 'active' } }],
    savedPlaces: [{ label: String, lat: Number, lng: Number, icon: String }],
    status: { type: String, enum: ['Safe', 'Lost', 'SOS'], default: 'Safe' },
    lostModeConfig: {
        message: { type: String, default: "If found, please call 9449." },
        audioAlertActive: { type: Boolean, default: false }
    },
    
    // --- Hardware Stats ---
    location: { lat: Number, lng: Number, speed: Number, updatedAt: Date },
    batteryLevel: { type: Number, default: 100 },
    
    // --- Metadata ---
    plan: { type: String, enum: ['free', 'premium'], default: 'free' },
    onboardingStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// --- Security Methods ---
userSchema.methods.setPassword = function(password) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.passwordHash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
};

userSchema.methods.validatePassword = function(password) {
    if (!this.passwordHash || !this.salt) return false;
    const hash = crypto.pbkdf2Sync(password, this.salt, 1000, 64, 'sha512').toString('hex');
    return this.passwordHash === hash;
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);