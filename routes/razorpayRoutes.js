const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');

// ✅ Use your initialized Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// POST /razorpay/create-order
router.post('/razorpay/create-order', async (req, res) => {
    try {
        const { amount } = req.body;

        const options = {
            amount: Math.round(amount * 100), // convert to paise
            currency: 'INR',
            receipt: 'receipt_' + Date.now(),
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);

        return res.status(200).json({
            success: true,
            razorpayOrderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (err) {
        console.error('Razorpay create-order error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
    }
});

module.exports = router;
