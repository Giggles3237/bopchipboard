const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const query = `
      SELECT 
        i.StockNumber,
        i.Year,
        i.Make,
        i.Model,
        i.VIN,
        v.Color,
        v.Status
      FROM indexfiletable i
      LEFT JOIN vautoexporttable v ON i.StockNumber = v.StockNumber
      WHERE 1=1
    `;

    const [vehicles] = await newPool.query(query);
    res.json(vehicles);
  } catch (error) {
    console.error('Error fetching unified vehicles:', error);
    res.status(500).json({ 
      message: 'Error fetching vehicles', 
      error: error.message 
    });
  }
});

module.exports = router; 