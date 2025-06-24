const Product = require('../models/Products');
const User = require('../models/User');
const cloudinary = require('../config/cloudinaryConfig');
const deleteCloudinaryImage = require('../utils/deleteCloudinaryImage');

const calculateAverageRating = (ratings) => {
    if (!ratings.length) return 0;
    const total = ratings.reduce((acc, cur) => acc + cur.rating, 0);
    return (total / ratings.length).toFixed(1);
};


// POST: Add product with image
const createProduct = async (req, res) => {
    console.log('createProduct', req.body);
    console.log('Files:', req.files);
    try {
        const {
            name, price, description, brand, category,
            offerPrice, colors, sizes, specifications
        } = req.body;

        if (!name || !brand || !description || !category || !req.files) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }

        const electronicsCategories = ['phone', 'laptop', 'tablet', 'smartwatch'];

        // Parse specifications
        let parsedSpecs = {};
        try {
            if (electronicsCategories.includes(category.toLowerCase()) && specifications) {
                parsedSpecs = JSON.parse(specifications);
            }
        } catch (err) {
            return res.status(400).json({ message: 'Invalid specifications JSON' });
        }

        const allImages = [...(req.files.images || []), ...(req.files.variantImages || [])];
        const uploadedImages = allImages.map(file => ({
            originalname: file.originalname,
            url: file.path,
            public_id: file.filename
        }));

        const variantList = JSON.parse(req.body.variants || '[]');
        if (!Array.isArray(variantList) || variantList.length === 0) {
            return res.status(400).json({ message: 'At least one variant is required.' });
        }

        let createdProducts = [];
        let allColors = new Set();
        let allSizes = new Set();

        for (let i = 0; i < variantList.length; i++) {
            const variant = variantList[i];

            const matchedThumbnails = (variant.thumbnails || []).map(fname =>
                uploadedImages.find(img => img.originalname === fname)
            ).filter(Boolean);

            let variantTitle = name;
            if (variant.ram && variant.rom && variant.color) {
                variantTitle += ` (${variant.ram} + ${variant.rom} - ${variant.color})`;
            } else if (variant.color) {
                variantTitle += ` (${variant.color})`;
            }
            console.log('variant', variant)
            const newProduct = new Product({
                baseName: name,
                name: variantTitle,
                description,
                price: variant.price,
                offerPrice: variant.offerPrice || null,
                category,
                brand,
                stock: variant.stock || 0,
                ram: variant.ram || null,
                rom: variant.rom || null,
                color: variant.color || null,
                size: variant.sizes || [],
                colors: variant.color ? [variant.color] : [],
                sizes: Array.isArray(variant.sizes) ? variant.sizes : [],
                specifications: parsedSpecs,
                productImages: matchedThumbnails.map(img => ({
                    url: img.url,
                    public_id: img.public_id
                }))
            });

            await newProduct.save();
            createdProducts.push(newProduct);

            if (variant.color) allColors.add(variant.color);
            if (Array.isArray(variant.sizes)) variant.sizes.forEach(s => allSizes.add(s));
        }

        // Set variants array only in the first product
        const firstProduct = createdProducts[0];
        if (firstProduct) {
            firstProduct.variants = createdProducts.map(p => ({
                _id: p._id,
                color: p.color,
                price: p.price,
                offerPrice: p.offerPrice,
                ram: p.ram,
                rom: p.rom,
                sizes: p.size,
                thumbnails: p.productImages.map(img => img.url),
                stock: p.stock
            }));

            firstProduct.colors = Array.from(allColors);
            firstProduct.sizes = Array.from(allSizes);
            await firstProduct.save();

            // Add parentProductId to other variants
            await Promise.all(createdProducts.slice(1).map(p =>
                Product.findByIdAndUpdate(p._id, { parentProductId: firstProduct._id })
            ));
        }

        return res.status(201).json({
            message: `${createdProducts.length} product${createdProducts.length > 1 ? 's' : ''} created`,
            productCount: createdProducts.length
        });
    } catch (err) {
        console.error("Product creation failed:", err);
        res.status(500).json({ message: "Server error." });
    }
};

// GET: All products (image as base64)
const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find({ isDeleted: { $ne: true } }); // optional isDeleted support

        const formatted = products.map(p => {
            const productImages = Array.isArray(p.productImages)
                ? p.productImages.map(img => img?.url).filter(Boolean)
                : (p.productImages?.url ? [p.productImages.url] : []);

            const variants = Array.isArray(p.variants) ? p.variants.map(v => ({
                _id: v._id,
                color: v.color || '',
                price: v.price || 0,
                offerPrice: v.offerPrice || null,
                ram: v.ram || '',
                rom: v.rom || '',
                stock: v.stock || 0,
                sizes: Array.isArray(v.sizes) ? v.sizes : [],
                thumbnails: Array.isArray(v.thumbnails) ? v.thumbnails : []
            })) : [];

            return {
                _id: p._id,
                name: p.name,
                description: p.description,
                brand: p.brand || '',
                price: p.price || 0,
                offerPrice: p.offerPrice || null,
                stock: p.stock || 0,
                category: p.category,
                productImages,
                ratings: p.ratings || [],
                averageRating: p.averageRating || 0,
                ram: p.ram || '',
                rom: p.rom || '',
                processor: p.specifications?.processor || '',
                colors: Array.isArray(p.colors) ? p.colors : [],
                sizes: Array.isArray(p.sizes) ? p.sizes : [],
                parentProductId: p.parentProductId || null,
                variants
            };
        });

        res.status(200).json(formatted);
    } catch (err) {
        console.error('Failed to fetch products:', err);
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

        const productImages = Array.isArray(product.productImages)
            ? product.productImages.map(img => img.url).filter(Boolean)
            : [];

        const ratingsFormatted = await Promise.all(
            product.ratings.map(async r => {
                const user = await User.findById(r.userId);
                return {
                    userName: r.userName,
                    avatar: user?.avatar?.url || null,
                    rating: r.rating,
                    comment: r.comment || null,
                    ratedImages: r.images?.map(img => img.url) || [],
                    date: r.date?.toISOString().split('T')[0] || ''
                };
            })
        );

        let variants = [];

        if (product.variants?.length > 0) {
            // This is the main product
            variants = product.variants;
        } else if (product.parentProductId) {
            const main = await Product.findById(product.parentProductId);
            variants = main?.variants || [];
        }

        // Normalize variants
        variants = (variants || []).map(v => ({
            _id: v._id,
            color: v.color,
            ram: v.ram,
            rom: v.rom,
            stock: v.stock,
            price: v.price || 0,
            offerPrice: v.offerPrice || null,
            sizes: v.sizes || [],
            thumbnails: v.thumbnails || []
        }));

        const response = {
            _id: product._id,
            name: product.name,
            description: product.description,
            price: product.price || 0,
            offerPrice: product.offerPrice || null,
            category: product.category,
            brand: product.brand || '',
            stock: product.stock || 0,
            productImages,
            ratings: ratingsFormatted,
            averageRating: product.averageRating || 0,
            colors: product.colors || [],
            sizes: product.sizes || [],
            processor: product.specifications?.processor || '',
            ram: product.ram || '',
            rom: product.rom || '',
            color: product.color || '',
            parentProductId: product.parentProductId || null,
            variants
        };

        return res.status(200).json(response);
    } catch (err) {
        console.error('Error fetching product:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// PUT: Update Main product by ID
const updateMainProduct = async (req, res) => {
    console.log('Update Main Product Request:', req.body);
    console.log('Files:', req.files);

    try {
        const { id } = req.params;
        const {
            name, price, description, brand, category, offerPrice, specifications
        } = req.body;

        const variantList = JSON.parse(req.body.variants || '[]');
        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({ message: 'Main product not found.' });
        }

        // Parse all uploaded images
        const allImages = [...(req.files?.images || []), ...(req.files?.variantImages || [])];
        const uploadedImages = allImages.map(file => ({
            originalname: file.originalname,
            url: file.path,
            public_id: file.filename
        }));

        // Parse specifications JSON
        let parsedSpecs = {};
        try {
            if (specifications) parsedSpecs = JSON.parse(specifications);
        } catch (err) {
            return res.status(400).json({ message: 'Invalid specifications format.' });
        }

        const updatedVariants = [];
        const allColors = new Set();
        const allSizes = new Set();

        for (let variant of variantList) {
            let productDoc;
            const isExisting = !!variant._id;

            if (isExisting) {
                productDoc = await Product.findById(variant._id);
                if (!productDoc) continue;
            } else {
                productDoc = new Product();
                productDoc.parentProductId = id;
            }

            // ✅ Match thumbnails to uploaded files
            const matchedImages = (variant.thumbnails || []).map(encodedName => {
                const decodedName = decodeURIComponent(encodedName);
                const match = uploadedImages.find(img => img.originalname === decodedName);
                if (!match) {
                    console.warn(`No match found for thumbnail "${decodedName}" in uploaded images`);
                }
                return match;
            }).filter(Boolean);

            const baseName = existingProduct.baseName || name.replace(/\s*\(.*?\)\s*$/, '');
            const title = baseName + (
                variant.ram && variant.rom && variant.color
                    ? ` (${variant.ram} + ${variant.rom} - ${variant.color})`
                    : variant.color ? ` (${variant.color})` : ''
            );

            // Assign fields
            productDoc.name = title;
            productDoc.description = description;
            // productDoc.price = price;
            // productDoc.offerPrice = offerPrice || null;
            productDoc.category = category;
            productDoc.brand = brand;
            productDoc.ram = variant.ram || null;
            productDoc.rom = variant.rom || null;
            productDoc.color = variant.color || null;
            productDoc.size = variant.sizes || [];
            productDoc.stock = variant.stock || 0;
            productDoc.colors = variant.color ? [variant.color] : [];
            productDoc.sizes = Array.isArray(variant.sizes) ? variant.sizes : [];
            productDoc.specifications = parsedSpecs;

            if (matchedImages.length > 0) {
                productDoc.productImages = matchedImages.map(img => ({
                    url: img.url,
                    public_id: img.public_id
                }));
            }

            // Save logic
            if (isExisting) {
                await Product.findByIdAndUpdate(productDoc._id, productDoc.toObject(), { new: true });
            } else {
                await productDoc.save();
            }

            updatedVariants.push(productDoc);

            if (variant.color) allColors.add(variant.color);
            if (Array.isArray(variant.sizes)) variant.sizes.forEach(s => allSizes.add(s));
        }

        // Update the main product
        existingProduct.name = name;
        existingProduct.price = price;
        existingProduct.description = description;
        existingProduct.brand = brand;
        existingProduct.category = category;
        existingProduct.offerPrice = offerPrice || null;
        existingProduct.specifications = parsedSpecs;
        existingProduct.colors = Array.from(allColors);
        existingProduct.sizes = Array.from(allSizes);
        existingProduct.variants = updatedVariants.map(v => ({
            _id: v._id,
            color: v.color,
            ram: v.ram,
            rom: v.rom,
            sizes: v.size,
            stock: v.stock,
            thumbnails: v.productImages.map(img => img.url)
        }));

        await existingProduct.save();

        return res.status(200).json({ message: 'Main product and variants updated successfully' });
    } catch (err) {
        console.error('Update error:', err);
        return res.status(500).json({ message: 'Server error while updating product' });
    }
};

//PUT: Update product by ID
const updateVariantProduct = async (req, res) => {
    console.log('Update Variant Request:', req.body);
    console.log('Files:', req.files);
    try {
        const { id } = req.params;
        const {
            name, price, description, stock, brand, offerPrice,
            color, ram, rom, sizes, specifications
        } = req.body;

        const variant = await Product.findById(id);
        if (!variant) return res.status(404).json({ message: 'Variant not found' });

        // Parse specifications if provided
        let parsedSpecs = {};
        try {
            if (specifications) parsedSpecs = JSON.parse(specifications);
        } catch (err) {
            return res.status(400).json({ message: 'Invalid specifications format' });
        }

        // Safely parse sizes (could be stringified or array)
        let parsedSizes = [];
        try {
            parsedSizes = typeof sizes === 'string'
                ? JSON.parse(sizes)
                : Array.isArray(sizes)
                    ? sizes
                    : [];
        } catch (err) {
            parsedSizes = [];
        }

        const allImages = req.files?.variantImages || [];
        const uploadedImages = allImages.map(file => ({
            originalname: file.originalname,
            url: file.path,
            public_id: file.filename
        }));

        // ✅ Assign updated fields
        variant.name = name;
        variant.price = price;
        variant.offerPrice = offerPrice || null;
        variant.description = description;
        variant.stock = stock || 0;
        variant.brand = brand;
        variant.color = color;
        variant.ram = ram;
        variant.rom = rom;
        variant.sizes = parsedSizes;
        variant.specifications = parsedSpecs;

        if (uploadedImages.length > 0) {
            variant.productImages = uploadedImages.map(img => ({
                url: img.url,
                public_id: img.public_id
            }));
        }

        await variant.save();

        // ✅ Sync update in main product’s `variants` list
        if (variant.parentProductId) {
            const mainProduct = await Product.findById(variant.parentProductId);
            if (mainProduct) {
                const index = mainProduct.variants.findIndex(v => v._id.toString() === id);
                if (index !== -1) {
                    mainProduct.variants[index] = {
                        _id: variant._id,
                        color: variant.color,
                        ram: variant.ram,
                        rom: variant.rom,
                        sizes: variant.sizes,
                        stock: variant.stock,
                        thumbnails: variant.productImages.map(img => img.url)
                    };
                    await mainProduct.save();
                }
            }
        }

        res.status(200).json({ message: 'Variant updated successfully' });
    } catch (err) {
        console.error('Variant update failed:', err);
        res.status(500).json({ message: 'Server error while updating variant' });
    }
};

//Delete product by ID
const deleteProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const isMain = !product.parentProductId;

        // Helper: Soft-delete a product
        const softDelete = async (prod) => {
            prod.isDeleted = true;
            await prod.save();
        };

        if (isMain) {
            const variants = await Product.find({ parentProductId: product._id });

            for (const variant of variants) {
                await softDelete(variant);
            }

            await softDelete(product);

            return res.status(200).json({
                message: `Main product and ${variants.length} variant(s) soft-deleted.`
            });
        }

        // Variant deletion
        await softDelete(product);

        if (product.parentProductId) {
            const mainProduct = await Product.findById(product.parentProductId);
            if (mainProduct) {
                // 1. Remove this variant from `variants[]`
                mainProduct.variants = mainProduct.variants.filter(
                    v => v._id.toString() !== product._id.toString()
                );

                // 2. Check if any *other active* variants still use this color
                const stillExists = await Product.exists({
                    parentProductId: product.parentProductId,
                    isDeleted: { $ne: true },
                    color: product.color
                });

                // 3. If not, remove the color from main product
                if (!stillExists && mainProduct.colors?.includes(product.color)) {
                    mainProduct.colors = mainProduct.colors.filter(c => c !== product.color);
                }

                // 4. Save main product
                await mainProduct.save();
            }
        }

        return res.status(200).json({ message: `Variant (${product.color}) soft-deleted.` });

    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ message: 'Server error during deletion.' });
    }
};


//Post: rating product by ID
const rateProductById = async (req, res) => {
    const { rating, comment } = req.body;
    const productId = req.params.id;
    const userId = req.user?.id;

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

        const user = await User.findById(userId);
        if (!user) {
            return res.status(403).json({ message: 'User not found or not authorized.' });
        }

        const existingRatingIndex = product.ratings.findIndex(r => r.userId.toString() === userId.toString());

        // ✅ Files are already uploaded to Cloudinary via multer-storage-cloudinary
        let uploadedImages = [];
        if (req.files && req.files.length > 0) {
            uploadedImages = req.files.map(file => ({
                url: file.path, // this is Cloudinary's secure_url
                public_id: file.filename // this is the Cloudinary public_id
            }));
        }

        const newRating = {
            userId,
            userName: req.user.name,
            rating: parseFloat(rating),
            comment: comment || '',
            images: uploadedImages,
            date: new Date()
        };

        if (existingRatingIndex !== -1) {
            product.ratings[existingRatingIndex] = newRating;
        } else {
            product.ratings.push(newRating);
        }

        product.averageRating = calculateAverageRating(product.ratings);
        await product.save();

        res.status(200).json({ message: 'Product rated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error. Please try again later.' });
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
    updateMainProduct,
    updateVariantProduct,
    deleteProductById,
    rateProductById,
    getRatingSummary,
    getUsers
};
