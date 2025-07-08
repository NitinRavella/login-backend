const mongoose = require('mongoose')
const User = require('../models/User');
const Product = require('../models/Products');


// controllers/cartController.js
const addToCart = async (req, res) => {
    const { userID } = req.params;
    const {
        productID,
        selectedColor,
        selectedSize,        // For fashion
        selectedRam,         // For electronics
        selectedRom,         // For electronics
        quantity
    } = req.body;

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (typeof productID !== 'string' || !mongoose.Types.ObjectId.isValid(productID)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }
        const product = await Product.findById(productID);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const isFashion = product.category === 'clothing' || product.category === 'shoes';

        // 🔍 Match variant by color + size or RAM/ROM
        const matchedVariant = product.variants.find(variant =>
            variant.color?.toLowerCase() === selectedColor?.toLowerCase() &&
            (isFashion
                ? variant.sizeStock?.some(s => s.size === selectedSize)
                : variant.ram === selectedRam && variant.rom === selectedRom)
        );

        if (!matchedVariant) {
            return res.status(400).json({ message: 'Matching variant not found' });
        }

        const variantId = matchedVariant.variantId;

        // ✅ Stock validation
        let availableStock = 0;
        if (isFashion) {
            const sizeObj = matchedVariant.sizeStock.find(s => s.size === selectedSize);
            if (!sizeObj || sizeObj.stock < 1) {
                return res.status(400).json({ message: 'Selected size is out of stock' });
            }
            availableStock = sizeObj.stock;
        } else {
            if (!matchedVariant.stock || matchedVariant.stock < 1) {
                return res.status(400).json({ message: 'Selected configuration out of stock' });
            }
            availableStock = matchedVariant.stock;
        }

        // 🛒 Check if already in cart
        const existingCartItem = user.cart.find(item =>
            item.product.toString() === productID &&
            item.variantId === variantId &&
            item.selectedColor === selectedColor &&
            (isFashion
                ? item.selectedSize === selectedSize
                : item.selectedRam === selectedRam && item.selectedRom === selectedRom)
        );

        if (existingCartItem) {
            const newQty = existingCartItem.quantity + quantity;
            if (newQty > availableStock) {
                return res.status(400).json({ message: 'Exceeds available stock' });
            }
            existingCartItem.quantity = newQty;
        } else {
            if (quantity > availableStock) {
                return res.status(400).json({ message: 'Requested quantity exceeds stock' });
            }

            // ✅ Push cart item without storing images (thumbnails are handled in getCart)
            user.cart.push({
                product: productID,
                variantId,
                selectedColor,
                selectedSize: selectedSize || null,
                selectedRam: selectedRam || null,
                selectedRom: selectedRom || null,
                quantity
            });
        }

        await user.save();
        res.status(200).json({ message: 'Added to cart', cart: user.cart });
    } catch (err) {
        console.error('Add to cart error:', err);
        res.status(500).json({ message: 'Error adding to cart', error: err.message });
    }
};


// getCart
const getCart = async (req, res) => {
    const { userID } = req.params;

    try {
        const user = await User.findById(userID).populate('cart.product');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const cartWithVariantData = user.cart.map(item => {
            const product = item.product?.toObject?.() || {};

            // Match variant using string variantId
            const variant = product.variants?.find(
                v => v.variantId === item.variantId
            );

            return {
                product: {
                    _id: product._id,
                    name: product.name,
                    category: product.category,
                    brand: product.brand,
                    baseName: product.baseName,
                    thumbnail: variant?.thumbnails?.[0] || product.mainImages?.[0] || null
                },
                variant: variant ? {
                    _id: variant._id,
                    variantId: variant.variantId,
                    color: variant.color,
                    ram: variant.ram,
                    rom: variant.rom,
                    sizeStock: variant.sizeStock || [],
                    stock: variant.stock ?? 0,
                    images: variant.images || [],
                    pricing: variant.pricing || {},
                    price: variant.price,
                    offerPrice: variant.offerPrice
                } : null,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize || null,
                selectedRam: item.selectedRam || null,
                selectedRom: item.selectedRom || null,
                quantity: item.quantity,
                variantId: item.variantId,
            };
        });

        return res.status(200).json(cartWithVariantData);
    } catch (err) {
        console.error('Get cart error:', err);
        return res.status(500).json({ message: 'Error fetching cart', error: err.message });
    }
};


// updateCart
const updateCartByQuantity = async (req, res) => {
    const { userID } = req.params;
    const {
        productId,
        quantity,
        selectedSize,
        selectedColor,
        selectedRam,
        selectedRom
    } = req.body;

    if (!productId || typeof quantity !== 'number') {
        return res.status(400).json({ message: 'Invalid product ID or quantity' });
    }

    try {
        const user = await User.findById(userID).populate('cart.product');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const isFashion = product.category === 'clothing' || product.category === 'shoes';

        // Find the correct variant
        const matchedVariant = product.variants.find(variant =>
            variant.color?.toLowerCase() === selectedColor?.toLowerCase() &&
            (isFashion
                ? variant.sizeStock?.some(s => s.size === selectedSize)
                : variant.ram === selectedRam && variant.rom === selectedRom)
        );

        if (!matchedVariant) {
            return res.status(404).json({ message: 'Matching variant not found' });
        }

        const variantId = matchedVariant.variantId;

        // Find existing cart item
        const existingItem = user.cart.find(item =>
            item.product &&
            item.product._id.toString() === productId.toString() &&
            item.variantId === variantId &&
            item.selectedColor === selectedColor &&
            (isFashion
                ? item.selectedSize === selectedSize
                : item.selectedRam === selectedRam && item.selectedRom === selectedRom)
        );

        if (!existingItem) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        // Stock check
        let availableStock = 0;
        if (isFashion) {
            const sizeObj = matchedVariant.sizeStock.find(s => s.size === selectedSize);
            if (!sizeObj || sizeObj.stock < 1) {
                return res.status(400).json({ message: `Size ${selectedSize} is out of stock` });
            }
            availableStock = sizeObj.stock;
        } else {
            availableStock = matchedVariant.stock;
            if (availableStock < 1) {
                return res.status(400).json({ message: `Selected configuration is out of stock` });
            }
        }

        if (quantity > availableStock) {
            return res.status(400).json({ message: `Only ${availableStock} in stock` });
        }

        // Update quantity
        existingItem.quantity = quantity;

        await user.save();
        await user.populate('cart.product');

        // Return updated cart with variants
        const cartWithUpdatedData = user.cart.map(item => {
            const product = item.product?.toObject?.() || {};
            const variant = product.variants?.find(v => v.variantId === item.variantId);

            return {
                product: {
                    _id: product._id,
                    name: product.name,
                    category: product.category,
                    brand: product.brand,
                    baseName: product.baseName,
                    mainImages: product.mainImages || [],
                },
                variant: variant ? {
                    _id: variant._id,
                    variantId: variant.variantId,
                    color: variant.color,
                    ram: variant.ram,
                    rom: variant.rom,
                    sizeStock: variant.sizeStock || [],
                    stock: variant.stock ?? 0,
                    images: variant.images || [],
                    pricing: variant.pricing || {},
                    price: variant.price,
                    offerPrice: variant.offerPrice
                } : null,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize || null,
                selectedRam: item.selectedRam || null,
                selectedRom: item.selectedRom || null,
                quantity: item.quantity,
                variantId: item.variantId
            };
        });

        res.json(cartWithUpdatedData);
    } catch (err) {
        console.error('Error updating cart:', err);
        res.status(500).json({ message: 'Error updating cart', error: err.message });
    }
};


// deleteFromCart
const deleteFromCart = async (req, res) => {
    const { userID, productID } = req.params;
    const {
        selectedSize = null,
        selectedColor = null,
        selectedRam = null,
        selectedRom = null,
        variantId = null
    } = req.body || {};

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.cart = user.cart.filter(item => {
            const matchProduct = item.product?.toString() === productID;
            const matchVariant = variantId ? item.variantId === variantId : true;
            const matchSize = selectedSize ? item.selectedSize === selectedSize : true;
            const matchColor = selectedColor ? item.selectedColor === selectedColor : true;
            const matchRam = selectedRam ? item.selectedRam === selectedRam : true;
            const matchRom = selectedRom ? item.selectedRom === selectedRom : true;

            // Keep the item if it DOES NOT match all criteria
            return !(matchProduct && matchVariant && matchSize && matchColor && matchRam && matchRom);
        });

        await user.save();
        res.status(200).json({ message: 'Item deleted', cart: user.cart });
    } catch (err) {
        console.error('Error deleting from cart:', err);
        res.status(500).json({ message: 'Failed to delete item from cart', error: err.message });
    }
};


module.exports = { addToCart, getCart, updateCartByQuantity, deleteFromCart };