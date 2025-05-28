const User = require('../models/User');


const addToCart = async (req, res) => {
    const { userID } = req.params;
    const { productID, quantity } = req.body;

    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const existingItem = user.cart.find(item => item.product.toString() === productID);

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            user.cart.push({ product: productID, quantity });
        }

        await user.save();

        // Populate the cart with product details
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

        const cartWithImages = user.cart.map(item => {
            const product = item.product;

            const base64Image = product?.image?.data
                ? `data:${product.image.contentType};base64,${product.image.data.toString('base64')}`
                : null;

            return {
                ...item.toObject(),
                product: {
                    ...product.toObject(),
                    image: base64Image
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
        if (cartItem) {
            cartItem.quantity = quantity;
            await user.save();

            // Populate updated cart
            await user.populate('cart.product');
            const cartWithImages = user.cart.map(item => ({
                ...item.toObject(),
                product: {
                    ...item.product.toObject(),
                    image: item.product.image?.data
                        ? `data:${item.product.image.contentType};base64,${item.product.image.data.toString('base64')}`
                        : null,
                },
            }));

            res.json(cartWithImages);
        } else {
            res.status(404).json({ message: 'Product not found in cart' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating cart' });
    }
}

//deleting the product from cart
const deleteFromCart = async (req, res) => {
    console.log(req.params);
    const { userID, productID } = req.params;
    console.log('Deleting product from cart:', { userID, productID });
    try {
        const user = await User.findById(userID);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.cart = user.cart.filter(item => item.product.toString() !== productID);

        await user.save();
        await user.populate('cart.product');
        const cartWithImages = user.cart.map(item => ({
            ...item.toObject(),
            product: {
                ...item.product.toObject(),
                image: item.product.image?.data
                    ? `data:${item.product.image.contentType};base64,${item.product.image.data.toString('base64')}`
                    : null,
            },
        }));

        res.json(cartWithImages);
    } catch (error) {
        console.error('Error removing product from cart:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

module.exports = { addToCart, getCart, updateCartByQuantity, deleteFromCart };