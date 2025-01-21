const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const { searchTerm, limit = 25, page = 1, sortBy = 'StockNumber', sortOrder = 'asc' } = req.query;
    
    // First check if the view exists
    const [viewCheck] = await newPool.query(`
      SELECT COUNT(*) as viewExists 
      FROM information_schema.views 
      WHERE table_schema = DATABASE() 
      AND table_name = 'latest_vehicle_summary'
    `);

    if (!viewCheck[0].viewExists) {
      throw new Error('Required view latest_vehicle_summary does not exist');
    }

    // Build base query
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
    params.push(Number(limit), (page - 1) * Number(limit));

    console.log('Executing query:', { query, params });

    // Execute main query with timeout
    const [vehicles] = await Promise.race([
      newPool.query(query, params),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 10000)
      )
    ]);

    // Get total count with a simpler query
    const [countResult] = await newPool.query(
      `SELECT COUNT(*) as total FROM latest_vehicle_summary WHERE 1=1 ${
        searchTerm ? 'AND StockNumber LIKE ?' : ''
      }`,
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
    console.error('Error in unified vehicles route:', error);
    
    // Send appropriate error response
    if (error.message.includes('timeout')) {
      res.status(504).json({
        message: 'Query timed out',
        error: error.message
      });
    } else if (error.code === 'ER_NO_SUCH_TABLE') {
      res.status(500).json({
        message: 'Database table not found',
        error: error.message
      });
    } else {
      res.status(500).json({
        message: 'Error fetching vehicles',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
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