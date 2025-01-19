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
        v.Status,
        v.Certified,
        v.Year,
        v.Make,
        v.Model,
        v.Series,
        v.Age,
        v.Color,
        v.Interior,
        v.VIN,
        v.Odometer,
        v.Equipment,
        v.Report,
        v.Recall,
        v.Warnings,
        v.Problems,
        v.RecallStatus,
        v.Tags,
        v.vRank,
        v.PriceRank,
        v.VinLeads,
        v.Price,
        v.ReconStatus,
        v.Chassis,
        k1.KeyStatus as Key1Status,
        k1.KeyLocation as Key1Location,
        k1.KeyUser as Key1User,
        k1.CheckoutLocalTime as Key1CheckoutTime,
        k2.KeyStatus as Key2Status,
        k2.KeyLocation as Key2Location,
        k2.KeyUser as Key2User,
        k2.CheckoutLocalTime as Key2CheckoutTime
      FROM latest_vehicle_summary v
      LEFT JOIN latest_key_data k1 ON v.StockNumber = k1.StockNumber AND k1.KeyDescription LIKE '%Key 1%'
      LEFT JOIN latest_key_data k2 ON v.StockNumber = k2.StockNumber AND k2.KeyDescription LIKE '%Key 2%'
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