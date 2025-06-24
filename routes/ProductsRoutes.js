const express = require('express');
const router = express.Router();
const upload = require('../utils/MulterConfig')

const {
    createProduct,
    getAllProducts,
    getProductById,
    updateMainProduct,
    updateVariantProduct,
    deleteProductById,
    rateProductById,
    getUsers,
    getRatingSummary,
} = require('../controller/ProductsController');

const { authenticate, adminOnly } = require('../middlerware/AuthMiddlerware');

// ✅ Admin only: Add product with image
router.post('/products', authenticate, adminOnly, upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'variantImages', maxCount: 30 }
]), createProduct);

// 🟢 Public: All products
router.get('/products', getAllProducts);
router.get('/products/:id', getProductById);

// ✅ Admin only: Update/Delete product
router.put('/products/:id', authenticate, adminOnly, upload.fields([
    { name: 'images' },
    { name: 'variantImages' }
]), updateMainProduct);

router.put('/variants/:id', authenticate, adminOnly, upload.fields([
    { name: 'variantImages' }
]), updateVariantProduct);

router.delete('/products/:id', authenticate, adminOnly, deleteProductById);

// ✅ Logged-in users only: Rate product
router.post('/product/:id/rating', authenticate, upload.array('reviewImages', 5), rateProductById);
router.get('/products/:id/ratings-summary', getRatingSummary)

//User routes
router.get('/all', authenticate, getUsers);

module.exports = router;
