// 1. IMPORT DEPENDENCIES
const User = require('../models/userModel'); // Import the blueprint you made
const bcrypt = require('bcryptjs');          // For encrypting passwords
const jwt = require('jsonwebtoken');         // For generating the "Login Token"

// Helper function to generate a Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', {
        expiresIn: '30d',
    });
};

// ==========================================
// CONTROLLER 1: REGISTER A NEW SUBSCRIBER
// ==========================================
exports.registerUser = async (req, res) => {
    const { name, email, password } = req.body;

    try {
        // Step A: Validation - Check if data exists
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please add all fields' });
        }

        // Step B: Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Step C: Hash the password (Security)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Step D: Create the User in Database
        // Note: 'role' defaults to 'subscriber' automatically from your Model
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        // Step E: Send Response (Auto-Login)
        // We send the user data + the token back to the frontend immediately
        if (user) {
            res.status(201).json({
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id), // <--- This logs them in!
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server Error during Registration' });
    }
};

// ==========================================
// CONTROLLER 2: GET ALL USERS (FOR ADMIN DASHBOARD)
// ==========================================
exports.getAllUsers = async (req, res) => {
    try {
        // Step A: Find all users in the DB
        // .sort({ date: -1 }) ensures the NEWEST users appear at the top
        // .select('-password') ensures we DO NOT send passwords to the dashboard
        const users = await User.find().sort({ date: -1 }).select('-password');

        // Step B: Send the list to the Admin Dashboard
        res.status(200).json(users);

    } catch (error) {
        res.status(500).json({ message: 'Server Error fetching users' });
    }
};

// ==========================================
// CONTROLLER 3: LOGIN USER (For returning users)
// ==========================================
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Check for user email
        const user = await User.findOne({ email });

        // 2. Check password matches
        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                _id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};