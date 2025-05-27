const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) return res.status(404).json({ message: 'User not found' });

        req.user = { id: user._id, name: user.fullName, role: user.isAdmin, createdAt: user.createdAt };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user.role !== true) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

module.exports = { authenticate, adminOnly };
