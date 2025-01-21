const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  try {
    const { searchTerm, limit = 25, page = 1, sortBy = 'StockNumber', sortOrder = 'asc' } = req.query;
    
    // First, get the total count with a simpler query
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM latest_vehicle_summary 
      WHERE 1=1
      ${searchTerm ? `AND (
        StockNumber LIKE ? OR
        VIN LIKE ? OR
        Make LIKE ? OR
        Model LIKE ? OR
        Color LIKE ?
      )` : ''}
    `;

    const countParams = searchTerm 
      ? Array(5).fill(`%${searchTerm}%`)
      : [];

    const [countResult] = await newPool.query(countQuery, countParams);
    const total = countResult[0].total;

    // If no results, return early
    if (total === 0) {
      return res.json({
        vehicles: [],
        pagination: {
          total: 0,
          page: Number(page),
          limit: Number(limit),
          totalPages: 0
        }
      });
    }

    // Build the main query with LIMIT for better performance
    const query = `
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
        ReconStatus as 'Recon Step',
        (
          SELECT JSON_OBJECT(
            'status', k1.Status,
            'user', k1.User,
            'checkoutTime', k1.Checkout_Local_Time,
            'location', k1.location
          )
          FROM keyperdata k1 
          WHERE k1.StockNumber = latest_vehicle_summary.StockNumber 
          ORDER BY k1.created_at DESC 
          LIMIT 1
        ) as Key1Data,
        (
          SELECT JSON_OBJECT(
            'status', k2.Status,
            'user', k2.User,
            'checkoutTime', k2.Checkout_Local_Time,
            'location', k2.location
          )
          FROM keyperdata k2 
          WHERE k2.StockNumber = latest_vehicle_summary.StockNumber 
          ORDER BY k2.created_at DESC 
          LIMIT 1, 1
        ) as Key2Data
      FROM latest_vehicle_summary
      WHERE 1=1
      ${searchTerm ? `AND (
        StockNumber LIKE ? OR
        VIN LIKE ? OR
        Make LIKE ? OR
        Model LIKE ? OR
        Color LIKE ?
      )` : ''}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const params = [
      ...(searchTerm ? Array(5).fill(`%${searchTerm}%`) : []),
      Number(limit),
      (page - 1) * limit
    ];

    console.log('Executing query with params:', {
      query,
      params,
      searchTerm,
      limit,
      page,
      sortBy,
      sortOrder
    });

    const [vehicles] = await newPool.query(query, params);

    // Process the JSON strings from Key1Data and Key2Data
    const processedVehicles = vehicles.map(vehicle => ({
      ...vehicle,
      Key1Status: vehicle.Key1Data ? JSON.parse(vehicle.Key1Data).status : null,
      Key1User: vehicle.Key1Data ? JSON.parse(vehicle.Key1Data).user : null,
      Key1CheckOutTime: vehicle.Key1Data ? JSON.parse(vehicle.Key1Data).checkoutTime : null,
      Key1Location: vehicle.Key1Data ? JSON.parse(vehicle.Key1Data).location : null,
      Key2Status: vehicle.Key2Data ? JSON.parse(vehicle.Key2Data).status : null,
      Key2User: vehicle.Key2Data ? JSON.parse(vehicle.Key2Data).user : null,
      Key2CheckOutTime: vehicle.Key2Data ? JSON.parse(vehicle.Key2Data).checkoutTime : null,
      Key2Location: vehicle.Key2Data ? JSON.parse(vehicle.Key2Data).location : null
    }));

    res.json({
      vehicles: processedVehicles,
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