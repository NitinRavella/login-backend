// controllers/AuthController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const dotenv = require('dotenv');
const { sendVerificationEmail, sendSuccessEmail } = require('./EmailController');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
dotenv.config();


const superadminOnly = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Superadmin access required' });
    }
    next();
};


const registerUser = async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { fullName }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Email or username already in use.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate 6-digit numeric verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        const newUser = new User({
            fullName,
            email,
            password: hashedPassword,
            role: ['admin', 'superadmin'].includes(role) ? role : 'user',
            isVerified: false,
            verificationCode,
            verificationCodeExpiresAt: Date.now() + 10 * 60 * 1000, // 10 mins
        });

        if (req.file) {
            newUser.avatar = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
            };
        }

        await newUser.save();

        // Send verification email
        await sendVerificationEmail(email, fullName, verificationCode);

        res.status(201).json({ message: 'User registered. Please verify your email.' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error. Try again later.' });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { email, code } = req.body;

        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.isVerified) {
            return res.status(400).json({ message: 'User already verified.' });
        }

        if (user.verificationCode !== code) {
            return res.status(400).json({ message: 'Invalid verification code.' });
        }

        if (Date.now() > user.verificationCodeExpiresAt) {
            return res.status(400).json({ message: 'Verification code expired.' });
        }

        user.isVerified = true;
        user.verificationCode = null;
        user.verificationCodeExpiresAt = null;

        await sendSuccessEmail(email, user.fullName);
        // try {
        // } catch (err) {
        //     res.status(500).json({ message: 'Failed to send success email.' });
        // }

        await user.save();
        res.json({ message: 'Email verified successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password, guestWishlist = [] } = req.body;

        const user = await User.findOne({ email });

        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        if (!user.isVerified) {
            return res.status(403).json({ message: 'Please verify your email before logging in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        // 🔄 Merge guest wishlist with user's existing wishlist
        if (guestWishlist.length > 0) {
            guestWishlist.forEach(({ productId, variantId }) => {
                const alreadyExists = user.wishlist.some(
                    item =>
                        item.productId.toString() === productId &&
                        item.variantId === variantId
                );
                if (!alreadyExists) {
                    user.wishlist.push({ productId, variantId });
                }
            });
            await user.save(); // Save only if any wishlist item was added
        }

        const accessToken = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        const refreshToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            token: accessToken,
            userId: user._id,
            name: user.fullName,
            email: user.email,
            role: user.role
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

const refreshAccessToken = (req, res) => {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token' });

    jwt.verify(token, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid refresh token' });

        try {
            const user = await User.findById(decoded.userId);
            if (!user) return res.status(404).json({ message: 'User not found' });

            const newAccessToken = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });

            res.json({ token: newAccessToken, role: user.role });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error' });
        }
    });
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
                role: user.role,
                avatar: avatarBase64
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

const roleUpdates = async (req, res) => {
    const { role } = req.body;
    const validRoles = ['user', 'admin']; //Added superadmin for role updated to superadmin

    if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified.' });
    }
    console.log('Updating user role', req.params.id, role);
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ message: `Role updated to ${role} for ${user.email}` });

    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

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

const toggleWishlist = async (req, res) => {
    const { userID, productID } = req.params;
    const { variantId } = req.body;
    if (!variantId) return res.status(400).json({ message: 'Variant ID is missing' });
    if (!userID) {
        return res.status(200).json({ message: 'Guest wishlist handled client-side', liked: true });
    }

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const index = user.wishlist.findIndex(item =>
            item.productId.toString() === productID && item.variantId === variantId
        );

        if (index === -1) {
            user.wishlist.push({ productId: productID, variantId });
            await user.save();
            return res.json({ message: 'Added to wishlist', liked: true });
        } else {
            user.wishlist.splice(index, 1);
            await user.save();
            return res.json({ message: 'Removed from wishlist', liked: false });
        }
    } catch (err) {
        console.error('Wishlist error:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};


const untoggleWishlist = async (req, res) => {
    const { userID, productID } = req.params;
    const { variantId } = req.body;

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const initialLength = user.wishlist.length;

        user.wishlist = user.wishlist.filter(item =>
            !(item.productId.toString() === productID && item.variantId === variantId)
        );

        if (user.wishlist.length === initialLength) {
            return res.status(404).json({ message: 'Item not found in wishlist' });
        }

        await user.save();
        return res.json({ message: 'Wishlist item removed successfully' });
    } catch (err) {
        console.error('Error in untoggleWishlist:', err);
        res.status(500).json({ message: 'Server error' });
    }
};


// GET /users/:userId/liked-products
const getWishlist = async (req, res) => {
    const { userID } = req.params

    if (!userID) {
        // Guest - tell frontend to load from localStorage
        return res.status(200).json({ wishlist: [] });
    }

    try {
        const user = await User.findById(userID).populate({
            path: 'wishlist.productId',
            model: 'Product',
            select: 'name brand category variants mainImages'
        });

        if (!user) return res.status(404).json({ message: 'User not found' });

        const wishlistItems = user.wishlist.map(item => {
            const product = item.productId;
            const matchedVariant = product?.variants?.find(v => v.variantId === item.variantId);

            return {
                productId: product?._id,
                name: product?.name,
                brand: product?.brand,
                category: product?.category,
                mainImages: product?.mainImages,
                variant: matchedVariant,
                variantId: item.variantId,
                addedAt: item.addedAt
            };
        });

        res.json({ wishlist: wishlistItems });
    } catch (err) {
        console.error('Get wishlist error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};;


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
                role: 'user',
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

module.exports = { registerUser, loginUser, refreshAccessToken, logoutUser, getProfile, updateUser, googleLogin, verifyEmail, superadminOnly, roleUpdates, toggleWishlist, untoggleWishlist, getWishlist };
