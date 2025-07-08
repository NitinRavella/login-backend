const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    baseName: { type: String }, // Optional: Common name for grouped variants
    name: { type: String, required: true },
    description: { type: String, required: true },
    brand: { type: String, required: true },
    category: { type: String, required: true }, // 'clothing', 'phone', etc.

    specifications: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Used for filters/search
    colors: [String],
    sizes: [String], // For fashion
    rams: [String],  // For electronics
    roms: [String],  // For electronics

    mainImages: [
        {
            url: { type: String },
            public_id: { type: String }
        }
    ],

    variants: [
        {
            variantId: { type: String, required: true }, // e.g., product-name-color-ram-rom

            color: { type: String, required: true }, // Used for both fashion and electronics

            // 🧵 Fashion only:
            sizeStock: [
                {
                    size: { type: String },
                    stock: { type: Number }
                }
            ],

            // 📱 Electronics only:
            ram: { type: String },
            rom: { type: String },
            stock: { type: Number }, // for electronics only (RAM/ROM based)

            pricing: {
                price: { type: Number, required: true },
                offerPrice: { type: Number, default: null },
                currency: { type: String, default: 'INR' }
            },

            images: [String] // URLs for thumbnails or carousel
        }
    ],

    // User ratings & reviews
    ratings: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            userName: String,
            rating: Number,
            comment: String,
            images: [{ url: String, public_id: String }],
            date: { type: Date, default: Date.now },

            // Optional context of the variant they bought
            selectedSize: String,
            selectedColor: String,
            selectedRam: String,
            selectedRom: String
        }
    ],

    averageRating: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false }, // for soft deletion

    parentProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null } // for variant grouping
}, {
    timestamps: true // adds createdAt, updatedAt
});

module.exports = mongoose.model('Product', ProductSchema);
