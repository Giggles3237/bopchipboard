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
        \`Stock #\` as stockNumber,
        Year,
        Make,
        Model,
        Color,
        VIN,
        Age,
        Interior,
        \`Current Price\` as price,
        \`New/Used\` as status,
        Certified,
        Series,
        Odometer,
        \`Recon Step\` as reconStep,
        chassis
      FROM unifiedvehicledata
      WHERE 1=1
    `;
    
    const params = [];

    if (searchTerm) {
      query += ` AND (
        \`Stock #\` LIKE ? OR
        CONCAT(Year, ' ', Make, ' ', Model) LIKE ? OR
        Color LIKE ? OR
        VIN LIKE ?
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