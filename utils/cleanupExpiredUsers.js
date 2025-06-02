// utils/cleanupExpiredUsers.js
const User = require('../models/User');

const cleanupExpiredUsers = async () => {
    try {
        const result = await User.deleteMany({
            isVerified: false,
            verificationCodeExpiresAt: { $lt: Date.now() }
        });

        if (result.deletedCount > 0) {
            console.log(`Cleaned up ${result.deletedCount} expired unverified user(s).`);
        }
    } catch (err) {
        console.error('Error cleaning up expired users:', err);
    }
};

module.exports = cleanupExpiredUsers;
