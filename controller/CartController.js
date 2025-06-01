const User = require('../models/User');


const addToCart = async (req, res) => {
    const { userID } = req.params;
    const { productID, quantity } = req.body;

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const existingItem = user.cart.find(item => item.product.toString() === productID)

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            user.cart.push({ product: productID, quantity });
        }

        await user.save();

        const updatedUser = await User.findById(userID).populate('cart.product');

        res.status(200).json({
            message: 'Added to cart',
            cart: updatedUser.cart,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding to cart', error });
    }
};


// controllers/cartController.js
const getCart = async (req, res) => {
    const { userID } = req.params;

    try {
        const user = await User.findById(userID).populate('cart.product');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const cartWithImages = user.cart
            .filter(item => item.product) // Skip items with missing product
            .map(item => {
                const product = item.product;

                const productImages = Array.isArray(product.productImages)
                    ? product.productImages.map(img =>
                        img?.data
                            ? `data:${img.contentType};base64,${img.data.toString('base64')}`
                            : null
                    ).filter(Boolean)
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
        console.error(error);
        res.status(500).json({ message: 'Error fetching cart', error });
    }
};

// updateCart by quantity
const updateCartByQuantity = async (req, res) => {
    const { userID } = req.params;
    const { productId, quantity } = req.body;

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const cartItem = user.cart.find(item => item.product.toString() === productId);
        if (!cartItem) {
            return res.status(404).json({ message: 'Product not found in cart' });
        }

        // Update quantity
        cartItem.quantity = quantity;
        await user.save();

        // Populate updated cart
        await user.populate('cart.product');

        // Format cart with multiple images
        const cartWithImages = user.cart
            .filter(item => item.product) // Ensure valid populated products
            .map(item => {
                const product = item.product;

                const productImages = Array.isArray(product.productImages)
                    ? product.productImages.map(img =>
                        img?.data
                            ? `data:${img.contentType};base64,${img.data.toString('base64')}`
                            : null
                    ).filter(Boolean)
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
        console.error(err);
        res.status(500).json({ message: 'Error updating cart' });
    }
};


//deleting the product from cart
const deleteFromCart = async (req, res) => {
    const { userID, productID } = req.params;

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.cart = user.cart.filter(item => item.product.toString() !== productID);
        await user.save();

        await user.populate('cart.product');

        const cartWithImages = user.cart
            .filter(item => item.product)
            .map(item => {
                const product = item.product;

                const productImages = Array.isArray(product.productImages)
                    ? product.productImages.map(img =>
                        img?.data
                            ? `data:${img.contentType};base64,${img.data.toString('base64')}`
                            : null
                    ).filter(Boolean)
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