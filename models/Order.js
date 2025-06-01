const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', require },
    quantity: String,
    price: { type: String },         // ✅ Must be included
    offerPrice: { type: String },
    cancelled: { type: Boolean, default: false }
});

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [orderItemSchema],
    shippingAddress: {
        address: String,
        city: String,
        state: String,
        pincode: String,
        phone: String
    },
    summary: {
        itemsPrice: Number,
        discount: Number,
        totalAmount: Number
    },
    paymentInfo: {
        method: String,
        status: String,
        transactionId: String
    },
    status: {
        type: String,
        enum: ['Placed', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'],
        default: 'Placed'
    },
    placedAt: { type: Date, default: Date.now },
    deliveredAt: Date,
    cancelledAt: Date
});

module.exports = mongoose.model('Order', orderSchema);
