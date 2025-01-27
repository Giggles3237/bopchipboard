const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const { 
      searchTerm, 
      searchType = 'general',
      limit = 25, 
      page = 1
    } = req.query;
    
    if (!searchTerm) {
      return res.json({ vehicles: [], pagination: { total: 0, page: 1, limit: 25, totalPages: 0 }});
    }

    // Query vehicle and both key tables with correct table names
    let query = `
      SELECT 
        u.*,
        k1.Status AS FirstKeyStatus,
        k1.User AS FirstKeyUser,
        k1.Location AS FirstKeyLocation,
        k1.\`Checkout Local Time\` AS FirstKeyCheckoutTime,
        k2.Status AS SecondKeyStatus,
        k2.User AS SecondKeyUser,
        k2.Location AS SecondKeyLocation,
        k2.\`Checkout Local Time\` AS SecondKeyCheckoutTime,
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
        v.Chassis
      FROM unifiedvehicledata u
      LEFT JOIN keyperdata k1 ON u.StockNumber = k1.StockNumber
      LEFT JOIN keyperdata_second_key k2 ON u.StockNumber = k2.StockNumber
      LEFT JOIN latest_vehicle_summary v ON u.StockNumber = v.StockNumber
      WHERE 
        CASE 
          WHEN ? = 'stock' THEN u.StockNumber LIKE ?
          ELSE (
            u.StockNumber LIKE ? OR
            v.Make LIKE ? OR
            v.Model LIKE ? OR
            v.VIN LIKE ? OR
            v.Color LIKE ?
          )
        END
      ORDER BY u.StockNumber ASC
    `;
    
    const searchPattern = searchType === 'stock' 
      ? ['stock', `${searchTerm}%`]  // Starts with for stock numbers
      : ['general', `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]; // Contains for general search

    console.log('Executing query:', { query, searchPattern }); // Debug log

    const [vehicles] = await newPool.query(query, searchPattern);
    
    res.json({
      vehicles: vehicles.slice(0, limit),
      pagination: {
        total: vehicles.length,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(vehicles.length / limit)
      }
    });

  } catch (error) {
    console.error('Error in unified vehicles route:', error);
    res.status(500).json({
      message: 'Error fetching vehicles',
      error: error.message
    });
  }
});

// Add a debug endpoint
router.get('/debug', authenticate, async (req, res) => {
  try {
    // Check table structures
    const [indexStructure] = await newPool.query(`
      DESCRIBE indexfiletable
    `);
    
    const [vautoStructure] = await newPool.query(`
      DESCRIBE vautoexporttable
    `);
    
    // Get sample rows from each table
    const [indexSample] = await newPool.query(`
      SELECT * FROM indexfiletable LIMIT 1
    `);
    
    const [vautoSample] = await newPool.query(`
      SELECT * FROM vautoexporttable LIMIT 1
    `);
    
    res.json({
      tableStructures: {
        indexfiletable: indexStructure,
        vautoexporttable: vautoStructure
      },
      sampleData: {
        indexfiletable: indexSample[0],
        vautoexporttable: vautoSample[0]
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ 
      message: 'Error in debug endpoint',
      error: error.message 
    });
  }
});

module.exports = router;
