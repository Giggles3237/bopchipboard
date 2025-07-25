const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { newPool } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Updated CORS configuration
app.use(cors({
    origin: ['https://bopchips.netlify.app', 'https://www.bopchips.netlify.app', 'http://localhost:3000', 'http://localhost:5001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept']
}));
app.use(express.json());

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Basic sales route with database
app.get('/api/sales', async (req, res) => {
  try {
    const [results] = await newPool.query('SELECT * FROM vehicle_sales ORDER BY deliveryDate DESC LIMIT 10');
    res.json(results);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Database error', error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something broke!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
