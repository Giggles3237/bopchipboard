const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    // First, let's verify the tables exist and have data
    const [tableCheck] = await newPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM indexfiletable) as indexCount,
        (SELECT COUNT(*) FROM vautoexporttable) as vautoCount
    `);
    
    console.log('Table record counts:', tableCheck);

    const query = `
      SELECT 
        i.StockNumber,
        i.Year,
        i.Make,
        i.Model,
        i.VIN,
        v.Color,
        v.Status,
        i.DateReceived,
        i.Age,
        i.DaysInStock
      FROM indexfiletable i
      LEFT JOIN vautoexporttable v ON i.StockNumber = v.StockNumber
      WHERE i.StockNumber IS NOT NULL
      ORDER BY i.DateReceived DESC
      LIMIT 100
    `;

    const [vehicles] = await newPool.query(query);
    
    console.log(`Query returned ${vehicles.length} vehicles`);
    
    // Log a sample vehicle if any exist
    if (vehicles.length > 0) {
      console.log('Sample vehicle:', vehicles[0]);
    }

    if (vehicles.length === 0) {
      console.log('No vehicles found. Query:', query);
    }

    res.json(vehicles);
  } catch (error) {
    console.error('Detailed error fetching unified vehicles:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      sql: error.sql
    });
    
    res.status(500).json({ 
      message: 'Error fetching vehicles', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        sqlMessage: error.sqlMessage
      } : undefined
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