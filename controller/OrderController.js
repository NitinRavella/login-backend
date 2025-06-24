const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Products')
const axios = require('axios');
const { toWords } = require('number-to-words');
const PDFDocument = require('pdfkit');
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

        const orders = await Order.find({ userId })
            .populate('items.product', 'name price offerPrice productImages')
            .sort({ placedAt: -1 });

        const ordersWithSummary = orders.map(order => {
            const itemsWithImages = order.items.map(item => {
                const product = item.product?.toObject?.() || {}; // handle missing/ref-deleted products

                return {
                    product: {
                        _id: product._id,
                        name: product.name,
                        price: product.price,
                        offerPrice: product.offerPrice,
                        productImages: product.productImages || [], // already in Cloudinary format
                    },
                    quantity: item.quantity,
                    cancelled: item.cancelled || false,
                };
            });

            return {
                _id: order._id,
                status: order.status,
                placedAt: order.placedAt,
                items: itemsWithImages,
                shippingAddress: order.shippingAddress,
                summary: order.summary,
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

const invoiceDownload = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('userId')
            .populate('items.product');

        if (!order) return res.status(404).send('Order not found');

        const doc = new PDFDocument({ margin: 40 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order._id}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).font('Times-Bold').text('ShopKart Pvt. Ltd.', { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text('Tax Invoice / Bill of Supply / Cash Memo', { underline: true, align: 'center' });
        doc.moveDown(1);

        // Company info
        doc.fontSize(10).font('Times-Roman').text('Sold By:', { underline: true });
        doc.text('ShopKart Pvt. Ltd.\n1st Floor, TechHub Lane\nHyderabad, Telangana, 500084\nIndia');
        // doc.text('PAN: AAAAA9999A\nGST: 27AAAAA9999A1Z5');
        doc.moveDown(0.5);

        // Billing & shipping addresses side by side
        const addressY = doc.y;
        const addressWidth = 240;

        // Billing Address (Left)
        doc.font('Times-Roman').text('Billing Address:', 50, addressY, { underline: true });
        doc.text(
            `${order.userId.fullName}\n${order.shippingAddress.address || ''}\n${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`,
            50,
            addressY + 15,
            { width: addressWidth }
        );

        // Shipping Address (Right)
        doc.font('Times-Roman').text('Shipping Address:', 300, addressY, { underline: true, align: 'right' });
        doc.text(
            `${order.userId.fullName}\n${order.shippingAddress.address || ''}\n${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`,
            300,
            addressY + 15,
            { width: addressWidth, align: 'right' }
        );

        doc.y = addressY + 80; // Adjust vertical position after addresses
        doc.moveDown(0.5);

        // Order Info
        doc.text(`Order No: ${order._id}`);
        doc.text(`Order Date: ${new Date(order.placedAt).toLocaleDateString()}`);
        doc.text(`Invoice No: INV-${order._id.toString().slice(-6)}`);
        doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        // === Table ===
        const tableTop = doc.y;
        const itemHeight = 20;

        // Column Positions
        const col1 = 50;    // Sl. No.
        const col2 = 70;    // Description
        const col3 = 350;   // Qty (right aligned)
        const col4 = 400;   // Unit Price (right aligned)
        const col5 = 480;   // Total (right aligned)
        const tableWidth = col5 - col1 + 30;

        // Table Header
        doc.font('Times-Bold');
        doc.text('Sl.', col1, tableTop);
        doc.text('Description', col2, tableTop);
        doc.text('Qty', col3, tableTop, { width: col4 - col3 - 10, align: 'right' });
        doc.text('Unit Price', col4, tableTop, { width: col5 - col4 - 10, align: 'right' });
        doc.text('Total', col5, tableTop, { align: 'right' });

        // Draw Header Line
        doc.moveTo(col1, tableTop + 15).lineTo(col1 + tableWidth, tableTop + 15).stroke();

        // Table Rows
        let y = tableTop + 20;
        let subtotal = 0;
        doc.font('Times-Roman');

        order.items.forEach((item, i) => {
            const lineTotal = item.quantity * item.product.price;
            subtotal += lineTotal;

            doc.text(`${i + 1}`, col1, y);
            doc.text(item.product.name, col2, y, { width: col3 - col2 - 10 });
            doc.text(item.quantity.toString(), col3, y, { width: col4 - col3 - 10, align: 'right' });
            doc.text(`Rs. ${item.product.price}`, col4, y, { width: col5 - col4 - 10, align: 'right' });
            doc.text(`Rs. ${lineTotal.toFixed(2)}`, col5, y, { align: 'right' });

            // Horizontal line after each row
            doc.moveTo(col1, y + itemHeight - 5).lineTo(col1 + tableWidth, y + itemHeight - 5).stroke();
            y += itemHeight;
        });

        // Table bottom border
        doc.moveTo(col1, y).lineTo(col1 + tableWidth, y).stroke();

        // Calculate taxes and totals
        const taxRate = 0.18; // 18% GST
        const taxAmount = subtotal * taxRate;
        const shippingFee = order.shippingFee || 0;
        const grandTotal = subtotal + taxAmount + shippingFee;

        // Totals section
        y += 10;
        doc.font('Times-Roman');
        doc.text(`Subtotal:`, col4, y, { align: 'left' });
        doc.text(`Rs. ${subtotal.toFixed(2)}`, col5, y, { align: 'right' });

        y += 20;
        doc.text(`Tax (18%):`, col4, y, { align: 'left' });
        doc.text(`Rs. ${taxAmount.toFixed(2)}`, col5, y, { align: 'right' });

        y += 20;
        doc.text(`Shipping:`, col4, y, { align: 'left' });
        doc.text(`Rs. ${shippingFee.toFixed(2)}`, col5, y, { align: 'right' });

        y += 20;
        doc.font('Times-Bold');
        doc.text(`Grand Total:`, col4, y, { align: 'left' });
        doc.text(`Rs. ${grandTotal.toFixed(2)}`, col5, y, { align: 'right' });

        // Amount in words
        doc.font('Times-Roman').text(`Amount in Words: Rupees ${toWords(Math.round(grandTotal)).replace(/\b\w/g, c => c.toUpperCase())} only`, col1, y + 40);

        // Footer
        doc.moveDown(6);
        doc.fontSize(9).fillColor('gray').text('This is a system-generated invoice. For queries, contact support@shopkart.com', {
            align: 'center'
        });

        doc.end();
    } catch (err) {
        console.error(err);
        res.status(500).send('Error generating invoice');
    }
};



module.exports = { Checkout, pincode, getUserOrders, cancelProductInOrder, cancelOrder, updateOrderStatusByAdmin, getAllOrders, getOrderById, invoiceDownload, getOrderStatusStats, getMonthlyOrdersStats }