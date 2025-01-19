const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    console.log('UnifiedVehicles route hit');
    const { searchTerm, limit } = req.query;
    console.log('Query params:', { searchTerm, limit });
    
    let query = `
      SELECT 
        v.*,
        k1.Status as Key1Status,
        k1.location as Key1Location,
        k1.User as Key1User,
        k1.\`Checkout Local Time\` as Key1CheckoutTime,
        k1.reason as Key1Reason,
        k2.Status as Key2Status,
        k2.location as Key2Location,
        k2.User as Key2User,
        k2.\`Checkout Local Time\` as Key2CheckoutTime,
        k2.reason as Key2Reason
      FROM latest_vehicle_summary v
      LEFT JOIN keyperdata k1 ON v.StockNumber = k1.StockNumber
      LEFT JOIN keyperdata_second_key k2 ON v.StockNumber = k2.StockNumber
      WHERE 1=1
    `;
    
    const params = [];
    console.log('Executing query:', query);
    console.log('With params:', params);

    if (searchTerm) {
      query += ` AND (
        v.StockNumber LIKE ? OR
        CONCAT(v.Year, ' ', v.Make, ' ', v.Model) LIKE ? OR
        v.Color LIKE ? OR
        v.VIN LIKE ?
      )`;
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(limit));
    }

    const [vehicles] = await newPool.query(query, params);
    console.log('Query results:', vehicles.length);
    res.json(vehicles);
    
  } catch (error) {
    console.error('Full error object:', error);
    res.status(500).json({ 
      message: 'Error fetching unified vehicles',
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router; 