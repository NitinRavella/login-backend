const express = require('express');
const router = express.Router();
const upload = require('../utils/MulterConfig')

const {
    createProduct,
    getAllProducts,
    getProductById,
    deleteProductById,
    rateProductById,
    getUsers,
    getRatingSummary,
    updateProductById,
    restoreProductById,
    getAllSoftDeletedProducts,
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
    { name: 'images', maxCount: 10 },
    { name: 'variantImages', maxCount: 30 }
]), updateProductById);

router.delete('/products/:id', authenticate, adminOnly, deleteProductById);
router.patch('/products/:id/restore', authenticate, adminOnly, restoreProductById)

router.get('/product/deleted/all', authenticate, adminOnly, getAllSoftDeletedProducts)

// ✅ Logged-in users only: Rate product
router.post('/product/:id/rating', authenticate, upload.array('reviewImages', 5), rateProductById);
router.get('/products/:id/ratings-summary', getRatingSummary)

//User routes
router.get('/all', authenticate, getUsers);

module.exports = router;
