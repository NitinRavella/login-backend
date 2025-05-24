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
} = require('../controller/ProductsController');
const authenticate = require('../middlerware/AuthMiddlerware');

// POST: Add product with image
router.post('/products', upload.single('image'), createProduct);

// GET: All products with base64 images
router.get('/products', getAllProducts);

router.get('/products/:id', getProductById)

// GET: Single product image by ID
router.get('/products/:id/image', getProductImage);

//PUT: Update product by ID
router.put('/products/:id', upload.single('image'), updateProductById);

// DELETE: Delete product by ID
router.delete('/products/:id', deleteProductById);

//POST: Add rating to product
router.post('/products/:id/rating', authenticate, rateProductById);

module.exports = router;
