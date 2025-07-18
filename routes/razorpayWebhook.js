// /routes/razorpayWebhook.js
const express = require('express');
const crypto = require('crypto');
const Order = require('../models/Order');
const router = express.Router();

// Use raw body parser only for this route
router.post('/razorpay/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.body.toString())
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(400).send('Invalid signature');
    }

    try {
        const event = JSON.parse(req.body);

        // ✅ Handle Payment Captured
        if (event.event === 'payment.captured') {
            const paymentId = event.payload.payment.entity.id;
            const razorpayOrderId = event.payload.payment.entity.order_id;

            await Order.findOneAndUpdate(
                { razorpayOrderId },
                {
                    paymentStatus: 'paid',
                    razorpayPaymentId: paymentId
                }
            );
        }

        // ✅ Handle Refund Processed or Failed
        if (event.event === 'refund.processed' || event.event === 'refund.failed') {
            const refund = event.payload.refund.entity;
            const refundId = refund.id;
            const refundStatus = refund.status;

            const order = await Order.findOne({ 'refunds.refundId': refundId });
            if (order) {
                const refundEntry = order.refunds.find(r => r.refundId === refundId);
                if (refundEntry) {
                    refundEntry.status = refundStatus; // 'processed' or 'failed'
                    await order.save();
                }
            }
        }

        return res.status(200).json({ received: true });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).send('Error handling webhook');
    }
});

module.exports = router;
