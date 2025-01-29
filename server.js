const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { newPool } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Updated CORS configuration
app.use(cors({
    origin: ['https://bopchips.netlify.app', 'https://www.bopchips.netlify.app', 'http://localhost:3000', 'http://localhost:5001'], // Production and local development URLs
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept']
}));
app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const salesRoutes = require('./routes/sales');
const notificationsRoutes = require('./routes/notifications');
const activitiesRoutes = require('./routes/activities');
const goalsRoutes = require('./routes/goals');
const unifiedVehiclesRoutes = require('./routes/unifiedVehicles');
const keysRouter = require('./routes/keys');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/unified-vehicles', unifiedVehiclesRoutes);
app.use('/api/keys', keysRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
