// utils/orderUtils.js
const Product = require('../models/Products');

const buildOrderItemsFromCart = async (cartItems) => {
    const productIds = cartItems.map(item => item.product);
    const productsFromDB = await Product.find({ _id: { $in: productIds } });

    const productMap = {};
    productsFromDB.forEach(product => {
        productMap[product._id.toString()] = product;
    });

    const orderItems = cartItems.map(item => {
        const product = productMap[item.product];
        if (!product) throw new Error(`Product not found: ${item.product}`);

        const variant = product.variants.find(v => v.variantId === item.variantId);
        if (!variant) throw new Error(`Variant not found: ${item.variantId}`);

        return {
            product: product._id,
            variantId: variant.variantId,
            name: product.name,
            quantity: item.quantity,
            price: String(variant.pricing.price),
            offerPrice: variant.pricing.offerPrice ? String(variant.pricing.offerPrice) : undefined,
            images: variant.images || [],
            selectedColor: item.selectedColor || null,
            selectedSize: item.selectedSize || null,
            selectedRam: item.selectedRam || null,
            selectedRom: item.selectedRom || null,
            cancelled: false
        };
    });

    return orderItems;
};

module.exports = { buildOrderItemsFromCart };
