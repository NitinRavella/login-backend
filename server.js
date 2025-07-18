const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/DBConnection');
const authRoutes = require('./routes/AuthRoutes');
const cookieParser = require('cookie-parser');
const productsRoutes = require('./routes/ProductsRoutes');
const orderRoutes = require('./routes/OrderRoutes')
const razorpayWebhook = require('./routes/razorpayWebhook');
const razorpayRoutes = require('./routes/razorpayRoutes');
const cleanupExpiredUsers = require('./utils/cleanupExpiredUsers');
const bodyParser = require('body-parser');


dotenv.config();
connectDB();

const app = express();

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// List of allowed origins
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://172.16.172.127:3000',
    'http://192.168.1.41:3000'
];

app.use(cookieParser());

setInterval(cleanupExpiredUsers, 5 * 60 * 1000);

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
app.use('/api', orderRoutes);
app.use('/api', razorpayWebhook);
app.use('/api', razorpayRoutes
)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
