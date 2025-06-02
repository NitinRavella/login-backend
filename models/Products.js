const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: String, required: true },
    offerPrice: { type: String },
    category: { type: String, required: true },
    stock: { type: Number, required: true },
    brand: { type: String, required: true },
    productImages: [
        {
            data: Buffer,
            contentType: String
        }
    ],
    ratings: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        userName: {
            type: String,
            required: true
        },
        rating: {
            type: Number,
            required: true
        },
        comment: String,
        images: [
            {
                data: Buffer,
                contentType: String
            }
        ],
        date: {
            type: Date,
            default: Date.now
        }
    }],
    averageRating: {
        type: Number,
        default: 0
    }


}, {
    timestamps: true
});

module.exports = mongoose.model('Product', ProductSchema);