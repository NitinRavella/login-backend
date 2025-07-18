const express = require('express');
const { Checkout, pincode, getUserOrders, cancelProductInOrder, cancelOrder, updateOrderStatusByAdmin, getAllOrders, getOrderById, getOrderStatusStats, getMonthlyOrdersStats, reorderOrderItems, verifyRazorpayPaymentAndPlaceOrder } = require('../controller/OrderController');
const { generateInvoicePDF } = require('../controller/invoiceController');
const router = express.Router();

router.post('/order/checkout', Checkout);
router.post('/verify-payment', verifyRazorpayPaymentAndPlaceOrder)
router.get('/pincode/:pincode', pincode);
router.get('/:userId/orders', getUserOrders);
router.post('/orders/:orderId/reorder', reorderOrderItems);

router.get('/orders/:orderId/invoice', generateInvoicePDF);

router.put('/orders/:orderId/cancel-product/:productId', cancelProductInOrder)
router.put('/orders/:orderId/cancel', cancelOrder);
router.put('/orders/:orderId/status', updateOrderStatusByAdmin)
router.get('/orders', getAllOrders)

router.get('/orders/:orderId', getOrderById)
router.get('/order-status-stats', getOrderStatusStats)
router.get('/monthly-orders-stats', getMonthlyOrdersStats)

module.exports = router;