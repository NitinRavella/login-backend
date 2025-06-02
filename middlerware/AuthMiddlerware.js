const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate the token and attach user info to req.user
const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        req.user = {
            id: user._id,
            name: user.fullName,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };

        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Middleware to allow only admin or superadmin access
const adminOnly = (req, res, next) => {
    const { role } = req.user;

    if (role !== 'admin' && role !== 'superadmin') {
        return res.status(403).json({ message: 'Admin or superadmin access required' });
    }

    next();
};

module.exports = { authenticate, adminOnly };
