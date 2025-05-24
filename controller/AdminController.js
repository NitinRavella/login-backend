const User = require('../models/User');

const setAdminStatus = async (req, res) => {
    console.log('Setting admin status');
    try {
        const userId = req.params.id;
        console.log(userId);
        const { isAdmin } = req.body;

        const user = await User.findById(userId);
        console.log(user);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.isAdmin = isAdmin;
        await user.save();

        res.json({
            message: `User admin status updated to ${isAdmin}`,
            user: {
                fullName: user.fullName,
                email: user.email,
                isAdmin: user.isAdmin
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { setAdminStatus };
