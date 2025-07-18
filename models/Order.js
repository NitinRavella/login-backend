const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String },
    name: { type: String },
    quantity: { type: Number, required: true },
    price: { type: String, required: true },
    offerPrice: { type: String },
    images: [String],
    selectedColor: { type: String },
    selectedSize: { type: String },
    selectedRam: { type: String },
    selectedRom: { type: String },
    cancelled: { type: Boolean, default: false }
});

const refundSchema = new mongoose.Schema({
    refundId: { type: String, required: true },              // Razorpay refund ID
    amount: { type: Number, required: true },                // Amount refunded in paise
    reason: { type: String },                                // Reason for refund
    status: {
        type: String,
        enum: ['pending', 'processed', 'failed'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: { type: String },
    items: [orderItemSchema],

    shippingAddress: {
        address: String,
        city: String,
        state: String,
        pincode: String,
        phone: String
    },

    summary: {
        itemsPrice: String,
        discount: String,
        totalAmount: String
    },

    status: {
        type: String,
        default: 'Placed' // Placed, Confirmed, Shipped, Delivered, Cancelled
    },

    // 🔒 PAYMENT INFO
    paymentMethod: {
        type: String,
        enum: ['COD', 'Razorpay'],
        default: 'COD'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded', 'partial-refunded'],
        default: 'pending'
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },

    // 🔁 MULTIPLE REFUND SUPPORT
    refunds: [refundSchema], // Array of refunds

    placedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
