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
const getreadyRoutes = require('./routes/getready');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/unified-vehicles', unifiedVehiclesRoutes);
app.use('/api/keys', keysRouter);
app.use('/api/getready', getreadyRoutes);

// Test route directly in server.js
app.post('/api/test-email', (req, res) => {
  console.log('📧 Direct test route hit');
  res.json({ message: 'Direct test route working!' });
});

// Debug: Log all registered routes
console.log('🔧 Registered API routes:');
console.log('- /api/auth');
console.log('- /api/users');
console.log('- /api/sales');
console.log('- /api/notifications');
console.log('- /api/activities');
console.log('- /api/goals');
console.log('- /api/unified-vehicles');
console.log('- /api/keys');
console.log('- /api/getready');

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});