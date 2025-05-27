const express = require('express');
const router = express.Router();
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });

const {
    createProduct,
    getAllProducts,
    getProductImage,
    getProductById,
    updateProductById,
    deleteProductById,
    rateProductById,
    getUsers,
} = require('../controller/ProductsController');

const { authenticate, adminOnly } = require('../middlerware/AuthMiddlerware');

// ✅ Admin only: Add product with image
router.post('/products', authenticate, adminOnly, upload.single('image'), createProduct);

// 🟢 Public: All products
router.get('/products', getAllProducts);
router.get('/products/:id', getProductById);
router.get('/products/:id/image', getProductImage);

// ✅ Admin only: Update/Delete product
router.put('/products/:id', authenticate, adminOnly, upload.single('image'), updateProductById);
router.delete('/products/:id', authenticate, adminOnly, deleteProductById);

// ✅ Logged-in users only: Rate product
router.post('/products/:id/rating', authenticate, rateProductById);

//User routes
router.get('/all', authenticate, getUsers);

module.exports = router;
