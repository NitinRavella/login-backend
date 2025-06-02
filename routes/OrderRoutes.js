const express = require('express');
const { Checkout, pincode, getUserOrders, cancelProductInOrder, cancelOrder, updateOrderStatusByAdmin, getAllOrders, getOrderById, invoiceDownload, getOrderStatusStats, getMonthlyOrdersStats } = require('../controller/OrderController');
const router = express.Router();

router.post('/order/place', Checkout);
router.get('/pincode/:pincode', pincode);
router.get('/:userId/orders', getUserOrders);

router.put('/orders/:orderId/cancel-product/:productId', cancelProductInOrder)
router.put('/orders/:orderId/cancel', cancelOrder);
router.put('/orders/:orderId/status', updateOrderStatusByAdmin)
router.get('/orders', getAllOrders)

router.get('/orders/:orderId', getOrderById)

router.get('/order/:orderId/invoice', invoiceDownload)
router.get('/order-status-stats', getOrderStatusStats)
router.get('/monthly-orders-stats', getMonthlyOrdersStats)

module.exports = router;