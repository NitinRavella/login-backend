const express = require('express');
const router = express.Router();
const multerUpload = require('../utils/MulterConfig');

const { registerUser, loginUser, refreshAccessToken, logoutUser, updateUser, getProfile, googleLogin, verifyEmail, superadminOnly, roleUpdates,
    toggleWishlist,
    getWishlist,
    untoggleWishlist } = require('../controller/UserController');
const { authenticate } = require('../middlerware/AuthMiddlerware');
const { addToCart, getCart, updateCartByQuantity, deleteFromCart } = require('../controller/CartController');

router.post('/register', multerUpload.single('avatar'), registerUser);
router.post('/verify-email', verifyEmail)
router.post('/login', loginUser);
router.post('/auth/refresh-token', refreshAccessToken);
router.post('/logout', logoutUser);
router.get('/profile', authenticate, getProfile);
router.put('/profile-update', authenticate, multerUpload.single('avatar'), updateUser);

router.post('/google-login', googleLogin)

// New route to update admin status of a user (only accessible by admin users) --> For updating the roles if superadmin whats then remove the superadminOnly and in the roleUpdates function add supperadmin
router.put('/users/role/:id', authenticate, superadminOnly, roleUpdates);

//wishlist products
router.post('/wishlist/toggle/:userID/:productID', authenticate, toggleWishlist);
router.delete('/wishlist/remove/:userID/:productID', authenticate, untoggleWishlist);

//get wishlist products
router.get('/wishlist/:userID', authenticate, getWishlist);

//cart routes
router.post('/:userID/cart', authenticate, addToCart)
router.get('/:userID/cart', authenticate, getCart)
router.put('/:userID/cart/update', authenticate, updateCartByQuantity)
router.delete('/:userID/cart/:productID', authenticate, deleteFromCart)


module.exports = router;
