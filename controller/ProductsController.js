const Product = require('../models/Products');
const User = require('../models/User');
const cloudinary = require('../config/cloudinaryConfig');
const deleteCloudinaryImage = require('../utils/deleteCloudinaryImage');

// const calculateAverageRating = (ratings) => {
//     if (!ratings.length) return 0;
//     const total = ratings.reduce((acc, cur) => acc + cur.rating, 0);
//     return (total / ratings.length).toFixed(1);
// };
function calculateAverageRating(ratings) {
    if (!ratings || ratings.length === 0) return 0;
    const total = ratings.reduce((sum, r) => sum + parseFloat(r.rating || 0), 0);
    return total / ratings.length;
}

// POST: Add product with image
const createProduct = async (req, res) => {
    console.log('req.body', req.body);
    console.log('req.files', req.files);

    try {
        const { name, description, brand, category, specifications } = req.body;

        if (!name || !brand || !description || !category || !req.files) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }

        const fashionCategories = ['clothing', 'shoes', 'apparel'];
        const electronicsCategories = ['phone', 'laptop', 'tablet', 'smartwatch'];

        // Parse specifications
        let parsedSpecs = {};
        try {
            if (specifications) parsedSpecs = JSON.parse(specifications);
        } catch (err) {
            return res.status(400).json({ message: 'Invalid specifications JSON' });
        }

        // Parse variant list
        const rawVariants = JSON.parse(req.body.variants || '[]');
        if (!Array.isArray(rawVariants) || rawVariants.length === 0) {
            return res.status(400).json({ message: 'At least one variant is required.' });
        }

        // Flatten uploaded images
        const uploadedImages = [
            ...(req.files.images || []),
            ...(req.files.variantImages || [])
        ].map(file => ({
            originalname: file.originalname,
            url: file.path,
            public_id: file.filename
        }));

        const allColors = new Set();
        const allSizes = new Set();
        const allRams = new Set();
        const allRoms = new Set();

        const variants = [];

        for (const variant of rawVariants) {
            const matchedImages = (variant.thumbnails || [])
                .map(fname => uploadedImages.find(img => img.originalname === fname))
                .filter(Boolean)
                .map(img => img.url);

            const baseVariantId = `${name}-${variant.color}`.replace(/\s+/g, '-').toLowerCase();

            // 🧵 Fashion Variant
            if (fashionCategories.includes(category.toLowerCase())) {
                const fashionVariant = {
                    variantId: baseVariantId,
                    color: variant.color,
                    sizeStock: variant.sizeStock || [],
                    pricing: {
                        price: variant.price,
                        offerPrice: variant.offerPrice || null,
                        currency: 'INR'
                    },
                    images: matchedImages
                };

                variant.sizeStock?.forEach(s => {
                    if (s.size) allSizes.add(s.size);
                });

                if (variant.color) allColors.add(variant.color);
                variants.push(fashionVariant);
            }

            // 📱 Electronics Variant
            if (electronicsCategories.includes(category.toLowerCase())) {
                if (!variant.ram || !variant.rom) continue;

                const electronicsVariant = {
                    variantId: `${baseVariantId}-${variant.ram}-${variant.rom}`.replace(/\s+/g, '-').toLowerCase(),
                    color: variant.color,
                    ram: variant.ram,
                    rom: variant.rom,
                    stock: variant.stock || 0,
                    pricing: {
                        price: variant.price,
                        offerPrice: variant.offerPrice || null,
                        currency: 'INR'
                    },
                    images: matchedImages
                };

                if (variant.color) allColors.add(variant.color);
                if (variant.ram) allRams.add(variant.ram);
                if (variant.rom) allRoms.add(variant.rom);
                variants.push(electronicsVariant);
            }
        }

        const newProduct = new Product({
            baseName: name,
            name,
            description,
            brand,
            category,
            specifications: parsedSpecs,
            mainImages: (req.files.images || []).map(file => ({
                url: file.path,
                public_id: file.filename
            })),
            colors: Array.from(allColors),
            sizes: Array.from(allSizes),
            rams: Array.from(allRams),
            roms: Array.from(allRoms),
            variants
        });

        await newProduct.save();

        res.status(201).json({
            message: 'Product created successfully',
            productId: newProduct._id
        });

    } catch (err) {
        console.error("Product creation error:", err);
        res.status(500).json({ message: "Server error." });
    }
};

// GET: All products (clean, consistent structure)
const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find({ isDeleted: { $ne: true } });

        const formatted = products.map(p => {
            const mainImages = Array.isArray(p.mainImages)
                ? p.mainImages.map(img => img?.url).filter(Boolean)
                : [];

            const variants = Array.isArray(p.variants)
                ? p.variants.map(v => ({
                    variantId: v.variantId,
                    color: v.color || '',
                    images: v.images || [],
                    price: v.pricing?.price || 0,
                    offerPrice: v.pricing?.offerPrice || null,
                    sizeStock: Array.isArray(v.sizeStock) ? v.sizeStock : [],
                    ram: v.ram || null,
                    rom: v.rom || null,
                    stock: v.stock ?? null
                }))
                : [];

            return {
                _id: p._id,
                name: p.name,
                description: p.description,
                brand: p.brand || '',
                category: p.category,
                specifications: p.specifications || {},
                mainImages,
                colors: Array.isArray(p.colors) ? p.colors : [],
                sizes: Array.isArray(p.sizes) ? p.sizes : [],
                rams: Array.isArray(p.rams) ? p.rams : [],
                roms: Array.isArray(p.roms) ? p.roms : [],
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
        if (!product || product.isDeleted) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Format mainImages
        const mainImages = Array.isArray(product.mainImages)
            ? product.mainImages.map(img => img?.url).filter(Boolean)
            : [];

        // Format ratings
        const ratingsFormatted = await Promise.all(
            (product.ratings || []).map(async r => {
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

        // Format variants
        const variants = (product.variants || []).map(v => ({
            _id: v._id,
            variantId: v.variantId,
            color: v.color || '',
            sizeStock: v.sizeStock || [],
            ram: v.ram || null,
            rom: v.rom || null,
            stock: v.stock ?? null,
            price: v.pricing?.price || 0,
            offerPrice: v.pricing?.offerPrice || null,
            thumbnails: v.images || []
        }));

        // Grouped Variant Options (for electronics only)
        const variantOptions = [];
        const isElectronics = ['phone', 'laptop', 'tablet', 'smartwatch'].includes(product.category?.toLowerCase());

        if (isElectronics) {
            const colorMap = {};
            for (const v of variants) {
                if (!v.color || !v.ram || !v.rom) continue;
                const key = v.color;
                if (!colorMap[key]) colorMap[key] = [];
                colorMap[key].push({
                    ram: v.ram,
                    rom: v.rom,
                    stock: v.stock ?? 0
                });
            }

            for (const [color, combos] of Object.entries(colorMap)) {
                variantOptions.push({
                    color,
                    combinations: combos
                });
            }
        }

        // Optional: Pick a defaultVariant (e.g., in-stock one or first one)
        const defaultVariant = variants.find(v => v.stock > 0) || variants[0] || null;

        // Final response
        const response = {
            _id: product._id,
            name: product.name,
            description: product.description,
            brand: product.brand,
            category: product.category,
            specifications: product.specifications || {},
            productImages: mainImages,
            ratings: ratingsFormatted,
            averageRating: product.averageRating || 0,
            colors: product.colors || [],
            sizes: product.sizes || [],
            rams: product.rams || [],
            roms: product.roms || [],
            variants,
            variantOptions,
            defaultVariant,
            parentProductId: product.parentProductId || null
        };

        return res.status(200).json(response);
    } catch (err) {
        console.error('Error fetching product:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// PUT: Update Main product by ID
const updateProductById = async (req, res) => {
    console.log('req', req.files)
    try {
        const productId = req.params.id;
        const { name, description, brand, category, specifications } = req.body;

        if (!name || !brand || !description || !category) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }

        const fashionCategories = ['clothing', 'shoes', 'apparel'];
        const electronicsCategories = ['phone', 'laptop', 'tablet', 'smartwatch'];

        let parsedSpecs = {};
        try {
            if (specifications) parsedSpecs = JSON.parse(specifications);
        } catch (err) {
            return res.status(400).json({ message: 'Invalid specifications JSON' });
        }

        const variantList = JSON.parse(req.body.variants || '[]');
        if (!Array.isArray(variantList) || variantList.length === 0) {
            return res.status(400).json({ message: 'At least one variant is required.' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const allImages = [...(req.files?.images || []), ...(req.files?.variantImages || [])];
        const uploadedImages = allImages.map(file => ({
            originalname: file.originalname,
            url: file.path,
            public_id: file.filename
        }));

        const updatedVariants = [];
        const allColors = new Set();
        const allSizes = new Set();
        const allRams = new Set();
        const allRoms = new Set();

        for (const variant of variantList) {
            const variantId = variant.variantId || `${name}-${variant.color}-${variant.ram || ''}-${variant.rom || ''}`
                .replace(/\s+/g, '-').toLowerCase();

            const existingVariant = product.variants.find(v => v.variantId === variantId);

            const matchedImages = (variant.thumbnails || []).map(fname =>
                uploadedImages.find(img => img.originalname === fname)
            ).filter(Boolean).map(img => img.url);

            const finalImages = matchedImages.length > 0
                ? matchedImages
                : existingVariant?.images || [];

            const pricing = {
                price: variant.price,
                offerPrice: variant.offerPrice || null,
                currency: 'INR'
            };

            const baseVariant = {
                variantId,
                color: variant.color,
                images: finalImages,
                pricing
            };

            if (fashionCategories.includes(category.toLowerCase())) {
                baseVariant.sizeStock = variant.sizeStock || [];
                baseVariant.sizeStock.forEach(s => allSizes.add(s.size));
            }

            if (electronicsCategories.includes(category.toLowerCase())) {
                baseVariant.ram = variant.ram || '';
                baseVariant.rom = variant.rom || '';
                baseVariant.stock = variant.stock || 0;

                if (variant.ram) allRams.add(variant.ram);
                if (variant.rom) allRoms.add(variant.rom);
            }

            if (variant.color) allColors.add(variant.color);

            updatedVariants.push(baseVariant);
        }

        // Update product details
        product.baseName = name;
        product.name = name;
        product.description = description;
        product.brand = brand;
        product.category = category;
        product.specifications = parsedSpecs;
        product.colors = Array.from(allColors);
        product.sizes = Array.from(allSizes);
        product.rams = Array.from(allRams);
        product.roms = Array.from(allRoms);

        // Main images update
        if (req.files?.images?.length) {
            product.mainImages = req.files.images.map(file => ({
                url: file.path,
                public_id: file.filename
            }));
        }

        product.variants = updatedVariants;

        await product.save();

        res.status(200).json({
            message: 'Product updated successfully',
            productId: product._id
        });

    } catch (err) {
        console.error("Product update error:", err);
        res.status(500).json({ message: "Server error." });
    }
};

//Delete product by ID
const deleteProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const isMain = !product.parentProductId;

        // Helper: Soft-delete a product (set stock to 0)
        const softDelete = async (prod) => {
            prod.isDeleted = true;
            prod.deletedAt = new Date();

            for (const variant of prod.variants || []) {
                if (variant.sizeStock && variant.sizeStock.length > 0) {
                    variant.sizeStock.forEach(sizeObj => sizeObj.stock = 0);
                } else {
                    variant.stock = 0;
                }
            }

            await prod.save();
        };

        if (isMain) {
            const variants = await Product.find({
                parentProductId: product._id,
                isDeleted: { $ne: true }
            });

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

        const parentId = product.parentProductId;

        if (parentId) {
            const mainProduct = await Product.findById(parentId);
            if (mainProduct) {
                mainProduct.variants = mainProduct.variants.filter(
                    v => v._id.toString() !== product._id.toString()
                );

                const otherSameColor = await Product.exists({
                    parentProductId: parentId,
                    color: product.color,
                    isDeleted: { $ne: true }
                });

                if (!otherSameColor && mainProduct.colors?.includes(product.color)) {
                    mainProduct.colors = mainProduct.colors.filter(c => c !== product.color);
                }

                const activeVariants = await Product.find({
                    parentProductId: parentId,
                    isDeleted: { $ne: true }
                });

                const updatedRams = [...new Set(activeVariants.map(v => v.ram).filter(Boolean))];
                const updatedRoms = [...new Set(activeVariants.map(v => v.rom).filter(Boolean))];

                mainProduct.rams = updatedRams;
                mainProduct.roms = updatedRoms;

                await mainProduct.save();
            }
        }

        return res.status(200).json({ message: `Variant (${product.color}) soft-deleted.` });

    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ message: 'Server error during deletion.' });
    }
};

// PATCH /api/products/:id/restore
const restoreProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        product.isDeleted = false;
        product.deletedAt = null;

        // Ensure all variants have `variantId`
        product.variants.forEach((variant, index) => {
            if (!variant.variantId) {
                // Create a fallback variantId like: product-name-color-ram-rom
                const slug = product.name.toLowerCase().replace(/\s+/g, '-');
                const parts = [slug, variant.color, variant.ram, variant.rom].filter(Boolean);
                variant.variantId = parts.join('-') + '-' + index;
            }

            // Optional: Reset stock if needed
            if (variant.stock === 0 || typeof variant.stock !== 'number') {
                variant.stock = 1;
            }

            // Optional: Reset sizeStock if it's fashion
            if (Array.isArray(variant.sizeStock)) {
                variant.sizeStock = variant.sizeStock.map(sizeEntry => ({
                    ...sizeEntry,
                    stock: sizeEntry.stock > 0 ? sizeEntry.stock : 1
                }));
            }
        });

        await product.save();

        return res.status(200).json({ message: 'Product restored successfully.' });
    } catch (err) {
        console.error('Restore error:', err);
        res.status(500).json({ message: 'Server error during restoration.' });
    }
};

//GET: All The delted products
const getAllSoftDeletedProducts = async (req, res) => {
    try {
        // Only fetch deleted main products
        const deletedProducts = await Product.find({
            isDeleted: true,
            parentProductId: null
        });

        return res.status(200).json({
            count: deletedProducts.length,
            products: deletedProducts
        });
    } catch (err) {
        console.error('Error fetching soft-deleted products:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

//Post: rating product by ID
const rateProductById = async (req, res) => {
    const { rating, comment, removeImageIds = [] } = req.body;
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
        let existingRating = existingRatingIndex !== -1 ? product.ratings[existingRatingIndex] : null;

        // ✅ Upload new images if any
        let newUploadedImages = [];
        if (req.files && req.files.length > 0) {
            newUploadedImages = req.files.map(file => ({
                url: file.path,
                public_id: file.filename
            }));
        }

        // ✅ Preserve old images unless explicitly removed
        let updatedImages = [];

        if (existingRating) {
            // Filter out removed images
            updatedImages = (existingRating.images || []).filter(img => !removeImageIds.includes(img.public_id));
        }

        // Combine old + new images
        updatedImages = [...updatedImages, ...newUploadedImages];

        const newRating = {
            userId,
            userName: req.user.name,
            rating: parseFloat(rating),
            comment: comment || '',
            images: updatedImages,
            date: new Date()
        };

        if (existingRatingIndex !== -1) {
            product.ratings[existingRatingIndex] = newRating;
        } else {
            product.ratings.push(newRating);
        }

        // ✅ Update average rating
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
            const rounded = Math.round(r.rating);
            if (ratingsCount[rounded] !== undefined) {
                ratingsCount[rounded] += 1;
            }
        });

        const totalRatings = product.ratings.length;
        const totalReviews = product.ratings.filter(r => r.comment && r.comment.trim() !== '').length;

        const avg = calculateAverageRating(product.ratings);
        const averageRating = avg ? parseFloat(avg.toFixed(1)) : 0.0;

        res.json({
            averageRating,
            ratings: ratingsCount,
            totalReviews,
            totalRatings
        });
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
    updateProductById,
    deleteProductById,
    restoreProductById,
    getAllSoftDeletedProducts,
    rateProductById,
    getRatingSummary,
    getUsers
};
