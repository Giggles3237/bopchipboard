const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: ['https://bopchips.netlify.app', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const salesRoutes = require('./routes/sales');
const notificationsRoutes = require('./routes/notifications');
const activitiesRoutes = require('./routes/activities');
const goalsRoutes = require('./routes/goals');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/goals', goalsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
