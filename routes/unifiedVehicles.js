const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const { searchTerm, limit } = req.query;
    
    let query = `
      SELECT 
        v.StockNumber,
        v.Year,
        v.Make,
        v.Model,
        v.Color,
        v.Price,
        v.Status,
        v.VIN,
        v.Age,
        v.Interior,
        v.Certified,
        v.Series,
        v.Odometer,
        v.ReconStatus as reconStep,
        v.Chassis as chassis,
        k.Status as KeyStatus,
        k.User as KeyUser,
        k.Location as KeyLocation,
        k.CheckOutDate,
        k.CheckInDate
      FROM latest_vehicle_summary v
      LEFT JOIN latest_key_data k ON v.StockNumber = k.StockNumber
      WHERE 1=1
    `;
    
    const params = [];

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
    res.json(vehicles);
    
  } catch (error) {
    console.error('Error fetching unified vehicles:', error);
    res.status(500).json({ 
      message: 'Error fetching vehicles data',
      error: error.message 
    });
  }
});

module.exports = router; 