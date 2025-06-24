const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    // Base name of the product (e.g., "Phone X")
    baseName: { type: String }, // Optional: useful if you want to separate raw name from variant names
    name: { type: String, required: true }, // Full display name, like "Phone X (8GB + 128GB - Blue)"

    description: { type: String, required: true },
    price: { type: Number },
    offerPrice: { type: Number }, // Changed from String to Number for consistency

    category: { type: String, required: true },
    stock: { type: Number, required: true },
    brand: { type: String, required: true },

    // Fields for individual variant product (used if this is a variant)
    ram: { type: String },
    rom: { type: String },
    color: { type: String },
    size: [String], // Sizes used by this specific product/variant

    // Filters for all variants (used only in main product)
    colors: [String],
    sizes: [String],

    specifications: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    productImages: [
        {
            url: { type: String },
            public_id: { type: String }
        }
    ],

    ratings: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            userName: { type: String, required: true },
            rating: { type: Number, required: true },
            comment: String,
            images: [
                {
                    url: String,
                    public_id: String
                }
            ],
            date: { type: Date, default: Date.now }
        }
    ],

    averageRating: {
        type: Number,
        default: 0
    },

    // ✅ Present only in the main product (not in variants)
    variants: [
        {
            _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            color: String,
            sizes: [String],
            thumbnails: [String], // These are image URLs
            stock: Number,
            ram: String,
            rom: String,
            price: Number,
            offerPrice: Number
        }
    ],

    // ✅ Used only in variant products to link back to main product
    parentProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        default: null
    },
    isDeleted: {
        type: Boolean,
        default: false
    }


}, {
    timestamps: true
});

module.exports = mongoose.model('Product', ProductSchema);
