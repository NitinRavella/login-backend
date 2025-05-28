const express = require('express');
const router = express.Router();
const multerUpload = require('../utils/MulterConfig');

const { registerUser, loginUser, refreshAccessToken, logoutUser, updateUser, getProfile, googleLogin, verifyEmail, superadminOnly, roleUpdates, likedProducts, unlikedProducts, getLikedProducts } = require('../controller/UserController');
const { setAdminStatus } = require('../controller/AdminController');
const { authenticate } = require('../middlerware/AuthMiddlerware');
const requireAdmin = require('../middlerware/requireAdmin');
const { addToCart, getCart, updateCartByQuantity, deleteFromCart } = require('../controller/CartController');

router.post('/register', multerUpload.single('avatar'), registerUser);
router.post('/verify-email', verifyEmail)
router.post('/login', loginUser);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logoutUser);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, multerUpload.single('avatar'), updateUser);

router.post('/google-login', googleLogin)

// New route to update admin status of a user (only accessible by admin users)
router.put('/users/role/:id', authenticate, superadminOnly, roleUpdates);

//liked products
router.post('/:userID/like/:productID', authenticate, likedProducts);
router.delete('/:userID/unlike/:productID', authenticate, unlikedProducts);

//get liked products
router.get('/:userID/liked-products', authenticate, getLikedProducts);

//cart routes
router.post('/:userID/cart', authenticate, addToCart)
router.get('/:userID/cart', authenticate, getCart)
router.put('/:userID/cart/update', authenticate, updateCartByQuantity)
router.delete('/:userID/cart/:productID', authenticate, deleteFromCart)


module.exports = router;
