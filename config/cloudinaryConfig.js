// utils/cloudinaryConfig.js
const cloudinary = require('cloudinary').v2;
require('dotenv').config(); // make sure this is loaded at the top level

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
