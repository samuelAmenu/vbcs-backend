const User = require('../models/User'); // Imports your Model
const bcrypt = require('bcryptjs');     // You must install this: npm install bcryptjs
const jwt = require('jsonwebtoken');    // You must install this: npm install jsonwebtoken

// Helper: Generate Token
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET || 'vbcs_secret_key', {
        expiresIn: '30d',
    });
};

// 1. REGISTER (Sign Up)
exports.registerUser = async (req, res) => {
    const { phoneNumber, password, fullName } = req.body;

    try {
        // Validation
        if (!phoneNumber || !password) {
            return res.status(400).json({ message: "Phone and Password are required" });
        }

        // Check Duplicate
        const userExists = await User.findOne({ phoneNumber });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User
        // Note: Role defaults to 'subscriber' automatically
        const user = await User.create({
            phoneNumber,
            password: hashedPassword,
            fullName
        });

        // Response with Token (Auto-Login)
        res.status(201).json({
            _id: user.id,
            phoneNumber: user.phoneNumber,
            fullName: user.fullName,
            role: user.role,
            token: generateToken(user._id, user.role)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error during Registration" });
    }
};

// 2. LOGIN
exports.loginUser = async (req, res) => {
    const { phoneNumber, password } = req.body;

    try {
        // Find User
        const user = await User.findOne({ phoneNumber });

        // Check Password
        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                _id: user.id,
                phoneNumber: user.phoneNumber,
                fullName: user.fullName,
                role: user.role,
                token: generateToken(user._id, user.role)
            });
        } else {
            res.status(401).json({ message: "Invalid Phone or Password" });
        }
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};

// 3. GET ALL USERS (For Admin Dashboard)
exports.getAllUsers = async (req, res) => {
    try {
        // Fetch all users, newest first
        const users = await User.find({}).sort({ createdAt: -1 }).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Error fetching users" });
    }
};