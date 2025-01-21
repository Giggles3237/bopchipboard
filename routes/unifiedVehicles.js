const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const { searchTerm, limit = 25, page = 1, sortBy = 'StockNumber', sortOrder = 'asc' } = req.query;
    
    // Simplified base query without subqueries
    let query = `
      SELECT 
        StockNumber,
        Year,
        Make,
        Model,
        VIN,
        Color,
        Status,
        Price as 'Current Price'
      FROM latest_vehicle_summary
      WHERE 1=1
    `;
    
    const params = [];

    // Add search condition if searchTerm exists
    if (searchTerm) {
      query += ` AND (
        StockNumber LIKE ? OR
        VIN LIKE ? OR
        Make LIKE ? OR
        Model LIKE ? OR
        Color LIKE ?
      )`;
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Add sorting and pagination
    query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(Number(limit), (page - 1) * limit);

    console.log('Executing query:', { query, params });

    // Execute query with timeout
    const [vehicles] = await Promise.race([
      newPool.query(query, params),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 10000)
      )
    ]);

    // Get total count
    const [countResult] = await newPool.query(
      `SELECT COUNT(*) as total FROM latest_vehicle_summary WHERE 1=1`,
      searchTerm ? [`%${searchTerm}%`] : []
    );
    
    const total = countResult[0].total;

    res.json({
      vehicles,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching vehicles:', error);
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