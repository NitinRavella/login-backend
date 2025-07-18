const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const path = require('path');
const fs = require('fs')
const getOrderStatusEmailTemplate = require('../emails/templates/orderStatusTemplate')
dotenv.config();

const sendVerificationEmail = async (toEmail, name, code) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: "Your Verification Code",
        html: `
      <h1>Email Verification</h1>
      <p>Hi ${name},</p>
      <p>Your verification code is: <b>${code}</b></p>
      <p>This code will expire in 10 minutes.</p>
      <p>Thank you!</p>
    `,
    };

    await transporter.sendMail(mailOptions);
};

const sendSuccessEmail = async (toEmail, name) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: "Register Form Submitted Successfully",
        html: `
        <img src=${process.env.EMAIL_LOGO} alt="Logo" style="width: 100px; height: auto;">
        <h1 style="color: #4CAF50;">Registration Successful</h1>
        <p>Hi ${name},</p>
        <p>Your Registation form was submitted successfully. 
        Thank you!</p>
        <p>Best regards,</p>`,
    };
    await transporter.sendMail(mailOptions);
};

const sendOrderConfirmationEmail = async (toEmail, data) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'orderConfirmationTemplate.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Simple replacements
    html = html.replace(/{{customerName}}/g, data.customerName);
    html = html.replace(/{{orderId}}/g, data.orderId);
    html = html.replace(/{{totalPrice}}/g, data.totalPrice.toFixed(2));
    html = html.replace(/{{paymentMethod}}/g, data.paymentMethod || 'N/A');
    html = html.replace(/{{placedAt}}/g, data.placedAt || new Date().toLocaleDateString());
    html = html.replace(/{{year}}/g, new Date().getFullYear());

    // Replace shipping address
    if (data.shippingAddress) {
        html = html.replace(/{{shippingAddress\.address}}/g, data.shippingAddress.address || '');
        html = html.replace(/{{shippingAddress\.city}}/g, data.shippingAddress.city || '');
        html = html.replace(/{{shippingAddress\.state}}/g, data.shippingAddress.state || '');
        html = html.replace(/{{shippingAddress\.pincode}}/g, data.shippingAddress.pincode || '');
        html = html.replace(/{{shippingAddress\.phone}}/g, data.shippingAddress.phone || '');
    }

    // Inject order items into HTML
    const itemsHtml = data.orderItems.map(item => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>₹${item.price.toFixed(2)}</td>
      </tr>
    `).join('');

    // Replace Handlebars loop with raw HTML
    html = html.replace(/{{#each orderItems}}([\s\S]*?){{\/each}}/, itemsHtml);

    const mailOptions = {
        from: `"Your Shop" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `🧾 Order Confirmation - #${data.orderId}`,
        html,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Order confirmation email sent to', toEmail);
    } catch (err) {
        console.error('❌ Failed to send confirmation email:', err);
    }
};

const sendRefundStatusEmail = async (toEmail, data) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'refundStatusTemplate.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    html = html.replace(/{{customerName}}/g, data.customerName);
    html = html.replace(/{{orderId}}/g, data.orderId);
    html = html.replace(/{{refundId}}/g, data.refundId);
    html = html.replace(/{{amount}}/g, data.amount.toFixed(2));
    html = html.replace(/{{reason}}/g, data.reason || 'Not specified');
    html = html.replace(/{{status}}/g, data.status || 'Pending');
    html = html.replace(/{{year}}/g, new Date().getFullYear());

    const mailOptions = {
        from: `"Your Shop" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `Refund Status Update for Order #${data.orderId}`,
        html,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Refund status email sent to', toEmail);
    } catch (err) {
        console.error('❌ Failed to send refund email:', err);
    }
};

const sendOrderStatusUpdateEmail = async (toEmail, data) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const html = getOrderStatusEmailTemplate({
        orderId: data.orderId,
        customerName: data.customerName,
        newStatus: data.newStatus,
        date: new Date().toLocaleDateString(),
        year: new Date().getFullYear()
    });

    await transporter.sendMail({
        from: '"Your Store" <your-email@example.com>',
        to: toEmail,
        subject: `Order Status Updated: ${data.newStatus}`,
        html,
    });
};

module.exports = { sendVerificationEmail, sendSuccessEmail, sendOrderConfirmationEmail, sendOrderStatusUpdateEmail, sendRefundStatusEmail };
