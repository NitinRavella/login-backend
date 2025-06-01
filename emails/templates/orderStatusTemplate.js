const statusGradientMap = {
    Placed: 'linear-gradient(135deg, #6c757d, #5a6268)',          // Gray
    Confirmed: 'linear-gradient(135deg, #007bff, #0056b3)',       // Blue
    Shipped: 'linear-gradient(135deg, #ffc107, #e0a800)',         // Yellow
    'Out for Delivery': 'linear-gradient(135deg, #17a2b8, #117a8b)', // Teal
    Delivered: 'linear-gradient(135deg, #28a745, #1e7e34)',       // Green
    Cancelled: 'linear-gradient(135deg, #dc3545, #a71d2a)'        // Red
};


function getOrderStatusEmailTemplate({ orderId, customerName, newStatus, date, year }) {
    const headerBackground = statusGradientMap[newStatus] || 'linear-gradient(135deg, #4CAF50, #45a049)';

    return `
<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <title>Order Status Update</title>
</head>

<body style="margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background-color: #f2f2f2;">
    <div
        style="max-width: 600px; margin: 30px auto; background-color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">

        <!-- Header -->
        <div style="background: ${headerBackground}; color: white; padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">📦 Order Status Update</h1>
            <p style="margin: 10px 0 0; font-size: 16px;">Order #${orderId}</p>
        </div>

        <!-- Body -->
        <div style="padding: 25px 30px; color: #333;">
            <p style="font-size: 16px;">Hi <strong>${customerName}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">
                We wanted to let you know that your order status has been updated. Please find the details below:
            </p>

            <div style="margin: 20px 0; padding: 15px; border-radius: 8px; background-color: #f9f9f9; border-left: 6px solid #4CAF50;">
                <p style="margin: 0; font-size: 16px;">
                    <strong>Current Status:</strong>
                    <span style="color: #4CAF50;">${newStatus}</span>
                </p>
                <p style="margin: 5px 0 0; font-size: 14px;">Updated on: ${date}</p>
            </div>

            <p style="font-size: 15px;">
                You can track your order or reach out to our support if you have any questions.
            </p>

            <div style="text-align: center; margin-top: 30px;">
                <a href="https://yourwebsite.com/order/${orderId}"
                    style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: #fff; text-decoration: none; font-size: 16px; border-radius: 6px;">
                    View Order
                </a>
            </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f1f1f1; text-align: center; padding: 15px 20px; font-size: 13px; color: #888;">
            <p style="margin: 0;">&copy; ${year} YourCompany. All rights reserved.</p>
        </div>

    </div>
</body>

</html>`;
}


module.exports = getOrderStatusEmailTemplate;