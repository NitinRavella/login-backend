const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinaryConfig');

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        // Use req.body.path if provided, otherwise use fieldname logic
        const customPath = req.body?.path;
        const folder = customPath
            ? `shopping-images/${customPath}`
            : file.fieldname === 'variantImages'
                ? 'shopping-images/products/variant'
                : 'shopping-images/products';

        return {
            folder,
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
            public_id: file.originalname.split('.')[0]
        };
    }
});

const upload = multer({ storage });
module.exports = upload;
