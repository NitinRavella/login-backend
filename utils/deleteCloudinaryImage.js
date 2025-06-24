const cloudinary = require('../config/cloudinaryConfig');

const deleteCloudinaryImage = async (public_id) => {
    try {
        const result = await cloudinary.uploader.destroy(public_id);
        return result;
    } catch (error) {
        console.error('Error deleting image from Cloudinary:', error);
        throw error;
    }
};

module.exports = deleteCloudinaryImage;
