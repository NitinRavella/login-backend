const express = require('express');
const router = express.Router();
const multerUpload = require('../utils/MulterConfig');

const { registerUser, loginUser, refreshAccessToken, logoutUser, updateUser, getProfile, googleLogin } = require('../controller/UserController');
const { setAdminStatus } = require('../controller/AdminController');
const { authenticate } = require('../middlerware/AuthMiddlerware');
const requireAdmin = require('../middlerware/requireAdmin');

router.post('/register', multerUpload.single('avatar'), registerUser);
router.post('/login', loginUser);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logoutUser);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, multerUpload.single('avatar'), updateUser);

router.post('/google-login', googleLogin)

// New route to update admin status of a user (only accessible by admin users)
router.put('/admin/:id', authenticate, requireAdmin, setAdminStatus);

module.exports = router;
