const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

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

module.exports = { sendSuccessEmail };
