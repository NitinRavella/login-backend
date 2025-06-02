const express = require('express');
const router = express.Router();
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });

const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProductById,
    deleteProductById,
    rateProductById,
    getUsers,
    getRatingSummary,
} = require('../controller/ProductsController');

const { authenticate, adminOnly } = require('../middlerware/AuthMiddlerware');

// ✅ Admin only: Add product with image
router.post('/products', authenticate, adminOnly, upload.array('images', 5), createProduct);

// 🟢 Public: All products
router.get('/products', getAllProducts);
router.get('/products/:id', getProductById);

// ✅ Admin only: Update/Delete product
router.put('/products/:id', authenticate, adminOnly, upload.array('images', 5), updateProductById);
router.delete('/products/:id', authenticate, adminOnly, deleteProductById);

// ✅ Logged-in users only: Rate product
router.post('/product/:id/rating', authenticate, upload.array('images', 5), rateProductById);
router.get('/products/:id/ratings-summary', getRatingSummary)

//User routes
router.get('/all', authenticate, getUsers);

module.exports = router;
