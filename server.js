const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/DBConnection');
const authRoutes = require('./routes/AuthRoutes');
const cookieParser = require('cookie-parser');
const productsRoutes = require('./routes/ProductsRoutes');

dotenv.config();
connectDB();

const app = express();

// List of allowed origins
const allowedOrigins = [
    'http://localhost:3000',
    'http://172.16.172.127:3000'
];

app.use(cookieParser());

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            return callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());

app.use('/api', authRoutes);
app.use('/api', productsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
