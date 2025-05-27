// controllers/AuthController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');
const { sendSuccessEmail } = require('./EmailController');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
dotenv.config();

const registerUser = async (req, res) => {
    try {
        const { fullName, email, password, isAdmin } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { fullName }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Email or username already in use.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            fullName,
            email,
            password: hashedPassword,
            isAdmin: isAdmin || false,
        });

        // If avatar image is uploaded, store in DB
        if (req.file) {
            newUser.avatar = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        await newUser.save();

        try {
            sendSuccessEmail(email, fullName);
        } catch (err) {
            console.error('Email sending failed:', err);
            return res.status(500).json({ message: 'User registered, but email failed.' });
        }

        res.status(201).json({ message: 'User registered successfully.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error. Try again later.' });
    }
};

const loginUser = async (req, res) => {
    console.log('Login user');
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const accessToken = jwt.sign({ userId: user._id, role: user.isAdmin ? 'admin' : 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '1h' });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 60 * 60 * 1000,
        });

        res.json({
            token: accessToken,
            name: user.fullName,
            email: user.email,
            isAdmin: user.isAdmin
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

const refreshAccessToken = (req, res) => {
    const token = req.cookies.refreshToken;
    console.log('Refreshing access token', token);
    if (!token) return res.status(401).json({ message: 'No refresh token' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        const userId = decoded.userId;

        // Fetch user to get isAdmin again
        User.findById(userId).then(user => {
            const newAccessToken = jwt.sign({ userId: user._id, role: user.isAdmin ? 'admin' : 'user' }, process.env.JWT_SECRET, { expiresIn: '1m' });

            const newRefreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '1h' });
            res.cookie('refreshToken', newRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: 60 * 60 * 1000,
            });

            res.json({ token: newAccessToken, isAdmin: user.isAdmin });
        });
    } catch (err) {
        return res.status(403).json({ message: 'Session expired' });
    }
};

const logoutUser = (req, res) => {
    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'Strict' });
    res.status(200).json({ message: 'Logged out successfully' });
};

const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        let avatarBase64 = '';
        if (user.avatar?.data) {
            avatarBase64 = `data:${user.avatar.contentType};base64,${user.avatar.data.toString('base64')}`;
        }

        res.status(200).json({
            user: {
                fullName: user.fullName,
                email: user.email,
                isAdmin: user.isAdmin,
                avatar: avatarBase64
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};


const updateUser = async (req, res) => {
    try {
        const { fullName, email } = req.body;
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (fullName) user.fullName = fullName;
        if (email) user.email = email;

        // If avatar image is uploaded, store in DB
        if (req.file) {
            user.avatar = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        await user.save();
        res.status(200).json({ message: 'User updated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error. Try again later.' });
    }
};

const googleLogin = async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, name, picture, sub } = payload;

        // Check if user exists
        let user = await User.findOne({ email });

        if (!user) {
            const response = await axios.get(picture, { responseType: 'arraybuffer' });
            const avatarBuffer = Buffer.from(response.data, 'binary');

            user = new User({
                fullName: name,
                email,
                password: sub,
                isAdmin: false,
                avatar: {
                    data: avatarBuffer,
                    contentType: response.headers['content-type'] || 'image/jpeg'
                }
            });

            sendSuccessEmail(email, name);

            await user.save();
        }

        const accessToken = jwt.sign(
            { userId: user._id, role: user.isAdmin ? 'admin' : 'user' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '1h' }
        );

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 60 * 60 * 1000,
        });

        res.json({
            token: accessToken,
            name: user.fullName,
            email: user.email,
            isAdmin: user.isAdmin
        });

    } catch (err) {
        console.error(err);
        res.status(401).json({ message: 'Invalid Google token' });
    }
};

module.exports = { registerUser, loginUser, refreshAccessToken, logoutUser, getProfile, updateUser, googleLogin };
