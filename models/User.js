// models/User.js
const mongoose = require('mongoose');


const cartItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 }
});

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin', 'superadmin'], default: 'user' },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String },
    verificationCodeExpiresAt: { type: Date },
    avatar: {
        data: Buffer,
        contentType: String
    },
    cart: [cartItemSchema],
    likedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });


module.exports = mongoose.model('User', UserSchema);