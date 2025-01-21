const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const { searchTerm, limit = 25, page = 1, sortBy = 'StockNumber', sortOrder = 'asc' } = req.query;
    
    // Build the base query using the correct view
    let query = `
      SELECT 
        StockNumber,
        Year,
        Make,
        Model,
        VIN,
        Color,
        Status,
        Age,
        Interior,
        Equipment as 'Starred Equip',
        Price as 'Current Price',
        ReconStatus as 'Recon Step'
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

    // Add sorting
    query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    console.log('Executing query:', query);
    console.log('With params:', params);

    // Execute query
    const [vehicles] = await newPool.query(query, params);
    
    // Get total count for pagination
    const [countResult] = await newPool.query(
      `SELECT COUNT(*) as total FROM latest_vehicle_summary WHERE 1=1`,
      searchTerm ? [`%${searchTerm}%`] : []
    );
    
    const total = countResult[0].total;

    console.log(`Found ${vehicles.length} vehicles out of ${total} total`);

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
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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