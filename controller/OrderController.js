const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Products')
const axios = require('axios');
const { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } = require('./EmailController');


//Checkout cart
const Checkout = async (req, res) => {
    const { userId, items, shippingAddress, summary } = req.body;

    try {
        const productIds = items.map(item => item.product._id || item.product);
        const productsFromDB = await Product.find({ _id: { $in: productIds } });

        const productMap = {};
        productsFromDB.forEach(p => {
            productMap[p._id.toString()] = p;
        });

        const orderItems = items.map(item => {
            const productId = item.product._id?.toString() || item.product.toString();
            const product = productMap[productId];

            if (!product) {
                throw new Error(`Product not found: ${productId}`);
            }

            return {
                product: product._id,
                name: product.name,
                quantity: item.quantity,
                price: String(product.price),
                offerPrice: product.offerPrice ? String(product.offerPrice) : undefined,
                cancelled: false
            };
        });

        const order = new Order({
            userId,
            shippingAddress,
            items: orderItems,
            summary: {
                itemsPrice: String(summary.itemsPrice),
                discount: String(summary.discount),
                totalAmount: String(summary?.totalAmount || 0)
            }
        });

        await order.save();
        await User.findByIdAndUpdate(userId, { $set: { cart: [] } });

        const user = await User.findById(userId);
        if (user && user.email) {
            const emailData = {
                customerName: user.fullName || 'Customer',
                orderId: order._id.toString(),
                orderItems: orderItems.map(i => ({
                    name: i.name,
                    quantity: i.quantity,
                    price: Number(i.offerPrice || i.price),
                })),
                totalPrice: Number(summary?.totalAmount || 0),
            };

            await sendOrderConfirmationEmail(user.email, emailData);
        }

        res.status(201).json({ success: true, order });
    } catch (err) {
        console.error("Checkout error:", err);
        res.status(500).json({ success: false, message: 'Checkout failed' });
    }
};

//Get User Orders
const getUserOrders = async (req, res) => {
    try {
        const userId = req.params.userId;

        // Populate products with images (full productImages array)
        const orders = await Order.find({ userId: userId })
            .populate('items.product', 'name price offerPrice productImages')
            .sort({ placedAt: -1 });

        const ordersWithSummary = orders.map(order => {
            const itemsWithImages = order.items.map(item => {
                const product = item.product.toObject(); // convert Mongoose doc to plain JS obj
                if (product.productImages && product.productImages.length) {
                    product.productImages = product.productImages.map(img => ({
                        dataUri: `data:${img.contentType};base64,${img.data.toString('base64')}`
                    }));
                } else {
                    product.productImages = [];
                }

                return {
                    product,
                    quantity: item.quantity,
                    cancelled: item.cancelled || false
                };
            });

            return {
                _id: order._id,
                status: order.status,
                placedAt: order.placedAt,
                items: itemsWithImages,
                shippingAddress: order.shippingAddress,
                summary: order.summary
            };
        });

        res.status(200).json({ success: true, orders: ordersWithSummary });
    } catch (err) {
        console.error("Failed to fetch orders", err);
        res.status(500).json({ success: false, message: "Failed to load order history" });
    }
};

//Get Order by ID
const getOrderById = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId).populate('items.product').populate('userId', 'name email');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        res.status(200).json({ success: true, order });
    } catch (err) {
        console.error('Failed to get order by ID', err);
        res.status(500).json({ success: false, message: 'Server error' });
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

//Cancel order By Product
const cancelProductInOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (!['Placed', 'Confirmed'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Product cannot be cancelled at this stage' });
        }

        const item = order.items.find(i => i.product.toString() === productId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Product not found in order' });
        }

        if (item.cancelled) {
            return res.status(400).json({ success: false, message: 'Product is already cancelled' });
        }

        // Mark the product as cancelled
        item.cancelled = true;

        let newItemsPrice = 0;
        let newDiscount = 0;

        for (const i of order.items) {
            if (i.cancelled) continue;

            const quantity = Number(i.quantity) || 0;
            const price = Number(i.price) || 0;
            const offer = i.offerPrice ? Number(i.offerPrice) : price;

            newItemsPrice += price * quantity;
            newDiscount += (price - offer) * quantity;
        }

        const newTotalAmount = newItemsPrice - newDiscount;

        order.summary.itemsPrice = String(newItemsPrice);
        order.summary.discount = String(newDiscount);
        order.summary.totalAmount = String(newTotalAmount);

        // Check if all products are cancelled
        const allCancelled = order.items.every(i => i.cancelled);

        if (allCancelled) {
            order.status = "Cancelled";  // Update order status to Cancelled
        }

        await order.save();

        res.status(200).json({
            success: true,
            message: 'Product cancelled successfully',
            order
        });
    } catch (err) {
        console.error('Cancel product error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

//Cancel Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Allow cancel only if status is "Placed" or "Confirmed"
        if (!['Placed', 'Confirmed'].includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled in current status: ${order.status}`
            });
        }

        // Update status
        order.status = 'Cancelled';

        // Optionally, mark all products as cancelled
        order.items.forEach(item => {
            item.cancelled = true;
        });

        await order.save();

        res.status(200).json({ success: true, message: 'Order cancelled successfully', order });
    } catch (err) {
        console.error('Cancel order error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
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




module.exports = { Checkout, pincode, getUserOrders, cancelProductInOrder, cancelOrder, updateOrderStatusByAdmin, getAllOrders, getOrderById }