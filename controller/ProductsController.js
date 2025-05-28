const Product = require('../models/Products');
const User = require('../models/User');

const calculateAverageRating = (ratings) => {
    if (!ratings.length) return 0;
    const total = ratings.reduce((acc, cur) => acc + cur.rating, 0);
    return total / ratings.length;
};


// POST: Add product with image
const createProduct = async (req, res) => {
    try {
        const { name, price, description, brand, stock, category, offerPrice } = req.body;

        if (!name || !price || !description || !category || !req.file) {
            return res.status(400).json({ message: 'All fields including image and category are required.' });
        }

        const product = new Product({
            name,
            price,
            description,
            stock,
            category,
            offerPrice: offerPrice || null,
            brand: brand || null,
            image: {
                data: req.file.buffer,
                contentType: req.file.mimetype
            }
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
            image: p.image?.data
                ? `data:${p.image.contentType};base64,${p.image.data.toString('base64')}`
                : null,
            ratings: p.ratings,
            averageRating: p.averageRating || 0,
        }));

        res.status(200).json(formatted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to fetch products.' });
    }
};

// GET: Product image by ID
const getProductImage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product || !product.image || !product.image.data) {
            return res.status(404).send('Image not found');
        }

        res.set('Content-Type', product.image.contentType);
        res.send(product.image.data);
    } catch (err) {
        res.status(500).send('Server error');
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
                return {
                    userName: r.userName,
                    avatar: user?.avatar?.data
                        ? `data:${user.avatar.contentType};base64,${user.avatar.data.toString('base64')}`
                        : null,
                    rating: r.rating,
                    comment: r.comment || null,
                    date: r.date.toISOString().split('T')[0]
                };
            })
        );

        const formatted = {
            _id: product._id,
            name: product.name,
            price: product.price,
            description: product.description,
            stock: product.stock,
            category: product.category,
            brand: product.brand || null,
            offerPrice: product.offerPrice || null,
            image: product.image?.data
                ? `data:${product.image.contentType};base64,${product.image.data.toString('base64')}`
                : null,
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
        const { name, price, description, stock, category, offerPrice, brand } = req.body;

        if (!name || !price || !description || !category) {
            return res.status(400).json({ message: 'All fields except image are required.' });
        }

        const updateData = {
            name,
            price,
            description,
            stock,
            brand: brand || null,
            category,
            offerPrice: offerPrice || null
        };

        if (req.file) {
            updateData.image = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product updated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update product.' });
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

        product.ratings.push({
            userId: req.user.id,
            userName: req.user.name,
            rating,
            comment
        });
        product.averageRating = calculateAverageRating(product.ratings);

        await product.save();

        res.status(200).json({ message: 'Product rated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to rate product.' });
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
    getProductImage,
    getProductById,
    updateProductById,
    deleteProductById,
    rateProductById,
    getUsers
};
