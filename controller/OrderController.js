const User = require('../models/User');
const mongoose = require('mongoose')
const Order = require('../models/Order');
const Product = require('../models/Products')
const axios = require('axios');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail, sendRefundStatusEmail } = require('./EmailController');
const { buildOrderItemsFromCart } = require('../utils/orderUtils')


const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Checkout Controller
const Checkout = async (req, res) => {
    const { userId, items, shippingAddress, summary, paymentMethod } = req.body;

    try {
        const user = await User.findById(userId);
        const orderItems = await buildOrderItemsFromCart(items);

        const order = new Order({
            userId,
            userEmail: user?.email || '',
            shippingAddress,
            items: orderItems,
            paymentMethod,
            paymentStatus: 'pending',
            summary: {
                itemsPrice: String(summary.itemsPrice),
                discount: String(summary.discount),
                totalAmount: String(summary.totalAmount)
            }
        });

        if (paymentMethod === 'Razorpay') {
            const razorpayOrder = await razorpay.orders.create({
                amount: Number(summary.totalAmount) * 100,
                currency: 'INR',
                receipt: `receipt_${Date.now()}`
            });

            order.razorpayOrderId = razorpayOrder.id;
            await order.save();

            return res.status(201).json({
                success: true,
                orderId: order._id,
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                orderCreated: true
            });
        } else {
            await order.save();
            await User.findByIdAndUpdate(userId, { $set: { cart: [] } });

            if (user?.email) {
                const emailData = {
                    customerName: user.fullName || 'Customer',
                    orderId: order._id.toString(),
                    orderItems: orderItems.map(i => ({
                        name: i.name,
                        quantity: i.quantity,
                        price: Number(i.offerPrice || i.price),
                    })),
                    totalPrice: Number(summary.totalAmount),
                    shippingAddress: {
                        address: shippingAddress.address,
                        city: shippingAddress.city,
                        state: shippingAddress.state,
                        pincode: shippingAddress.pincode,
                        phone: shippingAddress.phone
                    },
                    paymentMethod: paymentMethod || 'COD',
                };
                await sendOrderConfirmationEmail(user.email, emailData);
            }

            return res.status(201).json({
                success: true,
                message: 'Order placed successfully',
                orderId: order._id,
                orderCreated: true
            });
        }

    } catch (err) {
        console.error("Checkout error:", err);
        return res.status(500).json({ success: false, message: 'Checkout failed' });
    }
};

// POST /order/verify-payment
const verifyRazorpayPaymentAndPlaceOrder = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;

        if (!orderData || typeof orderData !== 'object') {
            return res.status(400).json({ success: false, message: "Invalid or missing order data" });
        }

        const { userId, items, summary, shippingAddress } = orderData;

        // Step 1: Verify Razorpay signature
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Invalid Razorpay signature" });
        }

        const user = await User.findById(userId);
        const orderItems = await buildOrderItemsFromCart(items);

        const order = new Order({
            userId,
            userEmail: user?.email || '',
            items: orderItems,
            shippingAddress,
            summary: {
                itemsPrice: String(summary.itemsPrice),
                discount: String(summary.discount),
                totalAmount: String(summary.totalAmount)
            },
            paymentMethod: 'Razorpay',
            paymentStatus: 'paid',
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature
        });

        await order.save();
        await User.findByIdAndUpdate(userId, { $set: { cart: [] } });

        if (user?.email) {
            const emailData = {
                customerName: user.fullName || 'Customer',
                orderId: order._id.toString(),
                orderItems: orderItems.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    price: Number(i.offerPrice || i.price),
                })),
                totalPrice: Number(summary.totalAmount),
                shippingAddress: {
                    address: shippingAddress.address,
                    city: shippingAddress.city,
                    state: shippingAddress.state,
                    pincode: shippingAddress.pincode,
                    phone: shippingAddress.phone
                },
                paymentMethod: paymentMethod || 'Razorpay',
            };
            await sendOrderConfirmationEmail(user.email, emailData);
        }

        return res.status(201).json({
            success: true,
            message: "Order placed and payment verified",
            orderId: order._id
        });

    } catch (error) {
        console.error("❌ Payment verification & order placement error:", error);
        return res.status(500).json({ success: false, message: "Server error while verifying payment" });
    }
};

//Get User Orders
const getUserOrders = async (req, res) => {
    try {
        const userId = req.params.userId;
        const orders = await Order.find({ userId }).sort({ placedAt: -1 });

        if (!orders.length) {
            return res.status(200).json({ success: true, orders: [] });
        }

        const productIds = orders.flatMap(order => order.items.map(item => item.product));
        const productsFromDB = await Product.find({ _id: { $in: productIds } });
        const productMap = Object.fromEntries(productsFromDB.map(p => [p._id.toString(), p]));

        const ordersWithDetails = orders.map(order => {
            const enrichedItems = order.items.map(item => {
                const product = productMap[item.product?.toString()];
                return {
                    product: product ? {
                        _id: product._id,
                        name: product.name,
                        brand: product.brand,
                        category: product.category
                    } : null,
                    variant: {
                        variantId: item.variantId || null,
                        images: item.images || [],
                        price: item.price || "0",
                        offerPrice: item.offerPrice || null,
                        color: item.selectedColor || null,
                        ram: item.selectedRam || null,
                        rom: item.selectedRom || null,
                        size: item.selectedSize || null
                    },
                    quantity: item.quantity,
                    cancelled: item.cancelled || false
                };
            });

            return {
                _id: order._id,
                status: order.status,
                placedAt: order.placedAt,
                items: enrichedItems,
                shippingAddress: order.shippingAddress,
                summary: order.summary,
                paymentInfo: {
                    method: order.paymentMethod,
                    status: order.paymentStatus,
                    razorpayOrderId: order.razorpayOrderId,
                    razorpayPaymentId: order.razorpayPaymentId,
                    razorpaySignature: order.razorpaySignature
                },
                refunds: order.refunds || []
            };
        });

        res.status(200).json({ success: true, orders: ordersWithDetails });

    } catch (err) {
        console.error("Failed to fetch orders", err);
        res.status(500).json({ success: false, message: "Failed to load order history" });
    }
};

//Get Order by ID
const getOrderById = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId).populate('userId', 'fullName email');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const productIds = order.items.map(item => item.product);
        const productsFromDB = await Product.find({ _id: { $in: productIds } });
        const productMap = Object.fromEntries(productsFromDB.map(p => [p._id.toString(), p]));

        const enrichedItems = order.items.map(item => {
            const product = productMap[item.product?.toString()];
            return {
                product: product ? {
                    _id: product._id,
                    name: product.name,
                    brand: product.brand,
                    category: product.category
                } : null,
                variant: {
                    variantId: item.variantId || null,
                    images: item.images || [],
                    price: item.price || "0",
                    offerPrice: item.offerPrice || null,
                    color: item.selectedColor || null,
                    ram: item.selectedRam || null,
                    rom: item.selectedRom || null,
                    size: item.selectedSize || null
                },
                quantity: item.quantity,
                cancelled: item.cancelled || false
            };
        });

        const enrichedOrder = {
            _id: order._id,
            user: {
                _id: order.userId?._id,
                name: order.userId?.fullName,
                email: order.userId?.email
            },
            userEmail: order.userEmail,
            status: order.status,
            placedAt: order.placedAt,
            items: enrichedItems,
            shippingAddress: order.shippingAddress,
            summary: order.summary,
            paymentInfo: {
                method: order.paymentMethod,
                status: order.paymentStatus,
                razorpayOrderId: order.razorpayOrderId,
                razorpayPaymentId: order.razorpayPaymentId,
                razorpaySignature: order.razorpaySignature
            },
            refunds: order.refunds || []
        };

        res.status(200).json({ success: true, order: enrichedOrder });

    } catch (err) {
        console.error("Failed to get order by ID", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


//Pincode 
const pincode = async (req, res) => {
    const { pincode } = req.params;

    try {
        const response = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
        const data = response.data[0];

        if (data.Status === "Success" && data.PostOffice?.length > 0) {
            const { District: city, State: state } = data.PostOffice[0];
            res.json({ city, state });
        } else {
            res.status(404).json({ error: "Invalid Pincode" });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data from postal API" });
    }
}

//Reorder the order
const reorderOrderItems = async (req, res) => {
    const { orderId } = req.params;
    const { userId } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid orderId or userId' });
        }

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const productIds = order.items.map(item => item.product);
        const products = await Product.find({ _id: { $in: productIds } });

        const productMap = {};
        products.forEach(p => productMap[p._id.toString()] = p);

        let addedCount = 0;

        for (const item of order.items) {
            if (item.cancelled) continue;

            const product = productMap[item.product.toString()];
            if (!product) continue;

            const variant = product.variants.find(v => v.variantId === item.variantId);
            if (!variant) continue;

            const isFashion = product.category === 'clothing' || product.category === 'shoes';

            let availableStock = 0;
            if (isFashion) {
                const sizeEntry = variant.sizeStock?.find(s => s.size === item.selectedSize);
                if (!sizeEntry || sizeEntry.stock < item.quantity) continue;
                availableStock = sizeEntry.stock;
            } else {
                if (!variant.stock || variant.stock < item.quantity) continue;
                availableStock = variant.stock;
            }

            const existingCartItem = user.cart.find(c =>
                c.product.toString() === product._id.toString() &&
                c.variantId === variant.variantId &&
                (isFashion
                    ? c.selectedSize === item.selectedSize
                    : c.selectedRam === item.selectedRam && c.selectedRom === item.selectedRom)
            );

            if (existingCartItem) {
                const newQty = existingCartItem.quantity + item.quantity;
                if (newQty > availableStock) continue;
                existingCartItem.quantity = newQty;
            } else {
                user.cart.push({
                    product: product._id,
                    variantId: variant.variantId,
                    selectedColor: item.selectedColor || variant.color || null,
                    selectedSize: item.selectedSize || null,
                    selectedRam: item.selectedRam || null,
                    selectedRom: item.selectedRom || null,
                    quantity: item.quantity
                });
            }

            addedCount++;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: `${addedCount} item(s) re-added to cart`
        });
    } catch (err) {
        console.error('Reorder failed:', err);
        res.status(500).json({ success: false, message: 'Reorder failed' });
    }
};

// Cancel a single product in the order
const cancelProductInOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (!['Placed', 'Confirmed'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Product cannot be cancelled at this stage' });
        }

        const item = order.items.find(i => i.product.toString() === productId);
        if (!item || item.cancelled) {
            return res.status(400).json({ success: false, message: 'Product not found or already cancelled' });
        }

        item.cancelled = true;

        // Recalculate pricing
        let newItemsPrice = 0, newDiscount = 0;
        for (const i of order.items) {
            if (i.cancelled) continue;
            const qty = Number(i.quantity);
            const price = Number(i.price);
            const offer = i.offerPrice ? Number(i.offerPrice) : price;

            newItemsPrice += price * qty;
            newDiscount += (price - offer) * qty;
        }

        const newTotalAmount = newItemsPrice - newDiscount;
        const refundAmount = Number(order.summary.totalAmount) - newTotalAmount;

        order.summary.itemsPrice = String(newItemsPrice);
        order.summary.discount = String(newDiscount);
        order.summary.totalAmount = String(newTotalAmount);

        const allCancelled = order.items.every(i => i.cancelled);
        if (allCancelled) order.status = 'Cancelled';

        // Handle refund if required
        if (
            refundAmount > 0 &&
            order.paymentMethod === 'Razorpay' &&
            order.paymentStatus === 'paid'
        ) {
            const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
                amount: Math.round(refundAmount * 100),
                notes: { reason: 'Partial Product Cancellation' }
            });

            order.paymentStatus = allCancelled ? 'refunded' : 'partial-refunded';

            order.refunds.push({
                refundId: refund.id,
                amount: refund.amount,
                reason: 'Partial Product Cancellation',
                status: 'pending'
            });

            const user = await User.findById(order.userId);

            if (user?.email) {
                await sendRefundStatusEmail(user.email, {
                    customerName: user.fullName || 'Customer',
                    orderId: order._id.toString(),
                    refundId: refund.id,
                    amount: refund.amount,
                    reason: 'Partial Product Cancellation',
                    status: 'pending'
                });
            }
        }

        await order.save();
        return res.status(200).json({ success: true, message: 'Product cancelled and refund initiated', order });

    } catch (err) {
        console.error('Cancel product error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Cancel the entire order
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (!['Placed', 'Confirmed'].includes(order.status)) {
            return res.status(400).json({ success: false, message: `Order cannot be cancelled in status: ${order.status}` });
        }

        order.status = 'Cancelled';
        order.items.forEach(item => item.cancelled = true);

        if (order.paymentMethod === 'Razorpay' && order.paymentStatus === 'paid') {
            const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
                amount: Number(order.summary.totalAmount) * 100,
                notes: { reason: 'Full Order Cancelled' }
            });

            order.paymentStatus = 'refunded';

            order.refunds.push({
                refundId: refund.id,
                amount: refund.amount,
                reason: 'Full Order Cancelled',
                status: 'pending'
            });

            const user = await User.findById(order.userId);

            if (user?.email) {
                await sendRefundStatusEmail(user.email, {
                    customerName: user.fullName || 'Customer',
                    orderId: order._id.toString(),
                    refundId: refund.id,
                    amount: refund.amount,
                    reason: 'Full Order Cancelled',
                    status: 'pending'
                });
            }
        }

        await order.save();
        return res.status(200).json({ success: true, message: 'Order cancelled and refund initiated', order });

    } catch (err) {
        console.error('Cancel order error:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

//Get all order
const getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('userId', 'fullName email')
            .populate('items.product', 'name price')
            .sort({ createdAt: -1 }); // latest first

        res.status(200).json({ success: true, orders });
    } catch (err) {
        console.error('Error fetching all orders:', err);
        res.status(500).json({ success: false, message: 'Server error fetching orders' });
    }
};

//change the order status:
const updateOrderStatusByAdmin = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;

        const validStatuses = ['Placed', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value' });
        }

        const order = await Order.findById(orderId).populate('userId'); // So we get user email
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.status = status;
        await order.save();

        // Send email notification
        await sendOrderStatusUpdateEmail(order.userId.email, {
            customerName: order.userId.fullName,
            orderId: order._id,
            newStatus: status,
            date: new Date().toLocaleDateString(),
        });

        res.status(200).json({ success: true, message: 'Order status updated successfully', order });
    } catch (err) {
        console.error('Failed to update order status', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Route: GET /monthly-orders-stats
const getMonthlyOrdersStats = async (req, res) => {
    try {
        const stats = await Order.aggregate([
            {
                $match: {
                    placedAt: { $exists: true }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$placedAt' },
                        month: { $month: '$placedAt' }
                    },
                    totalOrders: { $sum: 1 },
                    deliveredOrders: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0]
                        }
                    }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);

        const formatted = stats.map(item => ({
            month: `${item._id.month}/${item._id.year}`,
            total: item.totalOrders,
            delivered: item.deliveredOrders
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Monthly Orders Stats Error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
};

//Dashboard for Order status:
const getOrderStatusStats = async (req, res) => {
    try {
        const statusCounts = await Order.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        res.json(statusCounts);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching order stats");
    }
};

module.exports = { Checkout, pincode, getUserOrders, cancelProductInOrder, cancelOrder, updateOrderStatusByAdmin, getAllOrders, getOrderById, getOrderStatusStats, getMonthlyOrdersStats, reorderOrderItems, verifyRazorpayPaymentAndPlaceOrder }