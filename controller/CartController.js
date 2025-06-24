const User = require('../models/User');


const addToCart = async (req, res) => {
    const { userID } = req.params;
    const { productID, quantity, selectedSize } = req.body; // ✅ Include selectedSize

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const productIDStr = productID.toString();

        const existingItem = user.cart.find(item =>
            item.product &&
            item.product.toString() === productIDStr &&
            item.selectedSize === selectedSize // ✅ Match size too
        );

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            user.cart.push({ product: productID, quantity, selectedSize }); // ✅ Add size
        }

        await user.save();

        const updatedUser = await User.findById(userID).populate('cart.product');

        const cartWithImages = updatedUser.cart
            .filter(item => item.product)
            .map(item => {
                const product = item.product;
                const productImages = Array.isArray(product.productImages)
                    ? product.productImages.map(img => img?.url).filter(Boolean)
                    : [];
                return {
                    ...item.toObject(),
                    product: {
                        ...product.toObject(),
                        productImages
                    }
                };
            });

        res.status(200).json({
            message: 'Added to cart',
            cart: cartWithImages,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding to cart', error: error.message });
    }
};


// controllers/cartController.js
const getCart = async (req, res) => {
    const { userID } = req.params;

    try {
        const user = await User.findById(userID).populate('cart.product');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const cartWithImages = user.cart
            .filter(item => item.product) // Ensure product exists
            .map(item => {
                const product = item.product;

                const productImages = Array.isArray(product.productImages)
                    ? product.productImages.map(img => img?.url).filter(Boolean)
                    : [];

                return {
                    ...item.toObject(),
                    product: {
                        ...product.toObject(),
                        productImages
                    }
                };
            });

        res.json(cartWithImages);
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ message: 'Error fetching cart', error });
    }
};

// updateCart by quantity
const updateCartByQuantity = async (req, res) => {
    const { userID } = req.params;
    const { productId, quantity, selectedSize } = req.body;

    if (!productId || typeof quantity !== 'number' || !selectedSize) {
        return res.status(400).json({ message: 'Invalid product ID, quantity, or size' });
    }
    console.log('Updating cart for user:', userID, 'Product ID:', productId, 'Quantity:', quantity, 'Size:', selectedSize);
    try {
        const user = await User.findById(userID).populate('cart.product');
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Find existing cart item by productId (ignoring size initially)
        const existingItem = user.cart.find(item =>
            item.product &&
            item.product._id.toString() === productId.toString()
        );

        if (!existingItem) {
            return res.status(404).json({ message: 'Product not found in cart' });
        }

        // Check if there's already another cart item with same productId and new size
        const duplicateSizeItem = user.cart.find(item =>
            item.product &&
            item.product._id.toString() === productId.toString() &&
            item.selectedSize === selectedSize
        );

        if (duplicateSizeItem && duplicateSizeItem !== existingItem) {
            return res.status(400).json({ message: `Product already in cart with size ${selectedSize}` });
        }

        const availableStock = existingItem.product.stock;
        if (quantity > availableStock) {
            return res.status(400).json({
                message: `Only ${availableStock} item(s) in stock for size ${selectedSize}`
            });
        }

        // Update both size and quantity
        existingItem.selectedSize = selectedSize;
        existingItem.quantity = quantity;
        console.log('Updated cart item:', existingItem);
        await user.save();
        await user.populate('cart.product');

        const cartWithImages = user.cart
            .filter(item => item.product)
            .map(item => {
                const product = item.product;
                const productImages = Array.isArray(product.productImages)
                    ? product.productImages.map(img => img?.url).filter(Boolean)
                    : [];
                return {
                    ...item.toObject(),
                    product: {
                        ...product.toObject(),
                        productImages
                    }
                };
            });

        res.json(cartWithImages);
    } catch (err) {
        console.error('Error updating cart:', err);
        res.status(500).json({ message: 'Error updating cart', error: err.message });
    }
};


//deleting the product from cart
const deleteFromCart = async (req, res) => {
    const { userID, productID } = req.params;

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.cart = user.cart.filter(item =>
            !(item._id && item._id.toString() === productID.toString())
        );

        await user.save();
        await user.populate('cart.product');

        const cartWithImages = user.cart
            .filter(item => item.product)
            .map(item => {
                const product = item.product;
                const productImages = Array.isArray(product.productImages)
                    ? product.productImages.map(img => img?.url).filter(Boolean)
                    : [];
                return {
                    ...item.toObject(),
                    product: {
                        ...product.toObject(),
                        productImages
                    }
                };
            });

        res.status(200).json(cartWithImages);
    } catch (error) {
        console.error('Error removing product from cart:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


module.exports = { addToCart, getCart, updateCartByQuantity, deleteFromCart };