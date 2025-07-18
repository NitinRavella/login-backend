const PDFDocument = require('pdfkit');
const Order = require('../models/Order');

exports.generateInvoicePDF = async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await Order.findById(orderId).populate('userId');
        if (!order) return res.status(404).send('Order not found');

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=invoice_${orderId}.pdf`);
        doc.pipe(res);

        // ========== 1. Title ==========
        doc.font('Helvetica-Bold').fontSize(20).text('Invoice', { align: 'center' }).moveDown(1.5);

        // ========== 2. Order Info ==========
        doc
            .fontSize(11)
            .font('Helvetica')
            .text(`Order ID: ${order._id}`)
            .text(`Order Date: ${new Date(order.placedAt).toLocaleString()}`)
            .text(`Status: ${order.status}`)
            .moveDown();

        // ========== 3. Shipping Address ==========
        doc.font('Helvetica-Bold').text('Shipping Address:');
        doc
            .font('Helvetica')
            .text(`${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`)
            .text(`Phone: ${order.shippingAddress.phone}`)
            .moveDown();

        // ========== 4. Items Table ==========
        doc.font('Helvetica-Bold').text('Items:', { underline: true }).moveDown(0.5);

        // Table Headers
        const startX = 50;
        const rowHeight = 20;
        let y = doc.y;

        const colWidths = {
            name: 230,
            qty: 50,
            price: 80,
            subtotal: 80,
        };

        // Headers
        doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .text('Product', startX, y)
            .text('Qty', startX + colWidths.name + 10, y)
            .text('Price', startX + colWidths.name + colWidths.qty + 20, y)
            .text('Subtotal', startX + colWidths.name + colWidths.qty + colWidths.price + 30, y);

        y += rowHeight;
        doc.moveTo(startX, y - 5).lineTo(550, y - 5).stroke();

        // Items Loop
        doc.font('Helvetica').fontSize(10);
        order.items.forEach((item) => {
            const price = `${item.offerPrice || item.price}`
            const subtotal = price * item.quantity;

            doc.text(item.name, startX, y, { width: colWidths.name });
            doc.text(item.quantity.toString(), startX + colWidths.name + 10, y);
            doc.text(price, startX + colWidths.name + colWidths.qty + 20, y);
            doc.text(subtotal, startX + colWidths.name + colWidths.qty + colWidths.price + 30, y);

            y += rowHeight;

            // Variant Details
            const details = [];
            if (item.color) details.push(`Color: ${item.color}`);
            if (item.ram) details.push(`RAM: ${item.ram}`);
            if (item.rom) details.push(`ROM: ${item.rom}`);
            if (item.size) details.push(`Size: ${item.size}`);

            if (details.length) {
                doc
                    .fontSize(9)
                    .fillColor('gray')
                    .text(`(${details.join(', ')})`, startX, y)
                    .fillColor('black')
                    .fontSize(10);
                y += 15;
            }

            // Line after item
            doc.moveTo(startX, y - 5).lineTo(550, y - 5).stroke();
        });

        // ========== 5. Summary ==========
        y += 20;
        doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('Summary:', startX, y, { underline: true });
        y += rowHeight;

        doc
            .font('Helvetica')
            .fontSize(10)
            .text(`Items Price: ${order.summary.itemsPrice}`, startX, y);
        y += rowHeight;
        doc.text(`Discount: ${order.summary.discount}`, startX, y);
        y += rowHeight;
        doc.font('Helvetica-Bold').text(`Total Amount: ${order.summary.totalAmount}`, startX, y);
        y += rowHeight * 2;

        // ========== 6. Footer ==========
        doc
            .fontSize(10)
            .fillColor('gray')
            .text('Thank you for shopping with us!', startX, y, { align: 'center' });

        doc.end();
    } catch (err) {
        console.error('Invoice generation failed:', err);
        res.status(500).send('Invoice generation failed');
    }
};
