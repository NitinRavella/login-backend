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

    html = html.replace(/{{customerName}}/g, data.customerName);
    html = html.replace(/{{orderId}}/g, data.orderId);
    html = html.replace(/{{totalPrice}}/g, data.totalPrice.toFixed(2));
    html = html.replace(/{{year}}/g, new Date().getFullYear());

    const itemsHtml = data.orderItems.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>₹${item.price.toFixed(2)}</td>
    </tr>
  `).join('');

    html = html.replace(/{{#each orderItems}}([\s\S]*?){{\/each}}/, itemsHtml);

    const mailOptions = {
        from: '"Your Shop" <your-email@example.com>',
        to: toEmail,
        subject: `Order Confirmation - #${data.orderId}`,
        html,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully!');
    } catch (err) {
        console.error('❌ Failed to send email:', err);
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

module.exports = { sendVerificationEmail, sendSuccessEmail, sendOrderConfirmationEmail, sendOrderStatusUpdateEmail };
