const Product = require('../models/Products');
const User = require('../models/User');

const calculateAverageRating = (ratings) => {
    if (!ratings.length) return 0;
    const total = ratings.reduce((acc, cur) => acc + cur.rating, 0);
    return (total / ratings.length).toFixed(1);
};


// POST: Add product with image
const createProduct = async (req, res) => {
    try {
        const { name, price, description, brand, stock, category, offerPrice } = req.body;

        if (!name || !price || !description || !category || !req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'All fields including image and category are required.' });
        }

        let productImages = []
        if (req.files && req.files.length > 0) {
            productImages = req.files.map(file => ({
                data: file.buffer,
                contentType: file.mimetype,
            }));
        } else {
            console.log('No files received.');
        }

        const product = new Product({
            name,
            price,
            description,
            stock,
            category,
            offerPrice: offerPrice || null,
            brand: brand || null,
            productImages
        });

        await product.save();
        res.status(201).json({ message: 'Product added successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error. Try again later.' });
    }
};

// GET: All products (image as base64)
const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find();

        const formatted = products.map(p => ({
            _id: p._id,
            name: p.name,
            price: p.price,
            offerPrice: p.offerPrice || null,
            description: p.description,
            brand: p.brand || null,
            stock: p.stock,
            category: p.category,
            productImages: (p.productImages || []).map(img =>
                `data:${img.contentType};base64,${img.data.toString('base64')}`
            ),
            ratings: p.ratings,
            averageRating: p.averageRating || 0,
        }));

        res.status(200).json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch products.' });
    }
};

// GET: Product by ID (including base64 image)
const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const ratingsFormatted = await Promise.all(
            product.ratings.map(async r => {
                const user = await User.findById(r.userId);
                const ratedImages = Array.isArray(r.images)
                    ? r.images.map(img =>
                        img?.data
                            ? `data:${img.contentType};base64,${img.data.toString('base64')}`
                            : null
                    ).filter(Boolean)
                    : [];
                return {
                    userName: r.userName,
                    avatar: user?.avatar?.data
                        ? `data:${user.avatar.contentType};base64,${user.avatar.data.toString('base64')}`
                        : null,
                    rating: r.rating,
                    comment: r.comment || null,
                    ratedImages,
                    date: r.date.toISOString().split('T')[0]
                };
            })
        );
        const productImages = Array.isArray(product.productImages)
            ? product.productImages.map(img =>
                img?.data
                    ? `data:${img.contentType};base64,${img.data.toString('base64')}`
                    : null
            ).filter(Boolean)
            : [];

        const formatted = {
            _id: product._id,
            name: product.name,
            price: product.price,
            description: product.description,
            stock: product.stock,
            category: product.category,
            brand: product.brand || null,
            offerPrice: product.offerPrice || null,
            productImages,
            averageRating: product.averageRating || 0,
            ratings: ratingsFormatted
        };

        res.status(200).json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch product.' });
    }
};

// PUT: Update product by ID

const updateProductById = async (req, res) => {
    try {
        const {
            name, price, description, stock,
            category, offerPrice, brand,
            removedImageIndexes
        } = req.body;

        // Validate required fields
        if (!name || !price || !description || !category || !stock) {
            return res.status(400).json({
                message: 'Missing required fields',
                required: ['name', 'price', 'description', 'category', 'stock']
            });
        }

        // Find existing product
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Handle image removal
        if (removedImageIndexes) {
            try {
                const indexesToRemove = JSON.parse(removedImageIndexes);

                if (Array.isArray(indexesToRemove) && indexesToRemove.length > 0) {
                    // Validate indexes are within bounds
                    const validIndexes = indexesToRemove.filter(idx =>
                        idx >= 0 && idx < product.productImages.length
                    );

                    // Remove images (working backwards to avoid index shifting issues)
                    validIndexes
                        .sort((a, b) => b - a) // sort descending
                        .forEach(idx => product.productImages.splice(idx, 1));
                }
            } catch (err) {
                console.error('Error parsing removedImageIndexes:', err);
                // Continue without failing - treat as no images to remove
            }
        }

        // Handle new image uploads
        if (req.files && req.files.length > 0) {
            // Validate number of images won't exceed limit (e.g., 5)
            const totalImages = product.productImages.length + req.files.length;
            if (totalImages > 5) {
                return res.status(400).json({
                    message: 'Maximum of 5 images allowed per product'
                });
            }

            // Process new images
            const newImages = req.files.map(file => ({
                data: file.buffer,
                contentType: file.mimetype,
                // Consider adding: originalName: file.originalname
            }));

            product.productImages.push(...newImages);
        }

        // Update product fields
        product.name = name;
        product.price = parseFloat(price);
        product.description = description;
        product.stock = parseInt(stock);
        product.category = category;
        product.offerPrice = offerPrice ? parseFloat(offerPrice) : null;
        product.brand = brand || null;
        product.updatedAt = new Date();

        await product.save();

        // Return updated product (consider omitting image buffers)
        const responseProduct = product.toObject();
        delete responseProduct.productImages; // Remove heavy image data from response
        responseProduct.imageCount = product.productImages.length;

        res.status(200).json({
            message: 'Product updated successfully',
            product: responseProduct
        });

    } catch (err) {
        console.error('Update product error:', err);
        res.status(500).json({
            message: 'Failed to update product',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

//Delete product by ID

const deleteProductById = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product deleted successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to delete product.' });
    }
}

//Post: rating product by ID
const rateProductById = async (req, res) => {
    const { rating, comment } = req.body;
    const productId = req.params.id;

    if (!rating) {
        return res.status(400).json({ message: 'Rating is required.' });
    }

    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(file => ({
                data: file.buffer,
                contentType: file.mimetype,
            }));
            console.log('Mapped images:', images.length);
        } else {
            console.log('No files received.');
        }
        console.log('images', images)

        product.ratings.push({
            userId: req.user.id,
            userName: req.user.name,
            rating,
            comment,
            images,
        });

        product.averageRating = calculateAverageRating(product.ratings);
        await product.save();

        res.status(200).json({ message: 'Product rated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to rate product.' });
    }
};


// GET: /api/products/:id/ratings-summary
const getRatingSummary = async (req, res) => {
    const productId = req.params.id;

    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const ratingsCount = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

        product.ratings.forEach(r => {
            ratingsCount[r.rating] += 1;
        });
        const totalRatings = product.ratings.length;
        const totalReviews = product.ratings.filter(r => r.comment && r.comment.trim() !== '').length;

        const averageRating = calculateAverageRating(product.ratings);

        res.json({ averageRating, ratings: ratingsCount, totalReviews, totalRatings });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch ratings.' });
    }
};

const getUsers = async (req, res) => {
    console.log('Fetching all users', req.user);
    try {
        if (!req.user.role) {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const users = await User.find().select('-password');

        const formatted = users.map(user => ({
            _id: user._id,
            name: user.fullName,
            email: user.email,
            role: user.role,
            avatar: user.avatar?.data
                ? `data:${user.avatar.contentType};base64,${user.avatar.data.toString('base64')}`
                : null,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        }));

        res.status(200).json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch users.' });
    }
};

module.exports = {
    createProduct,
    getAllProducts,
    getProductById,
    updateProductById,
    deleteProductById,
    rateProductById,
    getRatingSummary,
    getUsers
};
