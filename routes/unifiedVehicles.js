const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { newPool } = require('../db');
const redis = require('redis');

const redisClient = redis.createClient();

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  await redisClient.connect();
})();

// Get unified vehicles
router.get('/', authenticate, async (req, res) => {
  const { searchTerm = '', limit = 25, page = 1, sortBy = 'StockNumber', sortOrder = 'asc' } = req.query;
  const offset = (page - 1) * limit;
  const cacheKey = `vehicles:${searchTerm}:${limit}:${page}:${sortBy}:${sortOrder}`;

  try {
    // Check cache first
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return res.json(JSON.parse(cachedData));
    }

    // Base query with JOIN optimization
    let query = `
      SELECT SQL_CALC_FOUND_ROWS 
        v.*,
        k1.Status as Key1Status,
        k1.User as Key1User,
        k1.Location as Key1Location,
        k1.CheckOutTime as Key1CheckOutTime,
        k2.Status as Key2Status,
        k2.User as Key2User,
        k2.Location as Key2Location,
        k2.CheckOutTime as Key2CheckOutTime
      FROM materialized_vehicle_summary v
      LEFT JOIN keyperdata k1 ON v.StockNumber = k1.StockNumber
      LEFT JOIN keyperdata_second_key k2 ON v.StockNumber = k2.StockNumber
      WHERE 1=1
    `;
    
    const params = [];

    // Optimize search conditions
    if (searchTerm) {
      query += ` AND (
        v.StockNumber = ? OR
        v.VIN = ? OR
        (
          v.StockNumber LIKE ? OR
          CONCAT(v.Year, ' ', v.Make, ' ', v.Model) LIKE ? OR
          v.VIN LIKE ?
        )
      )`;
      // Add exact match parameters first
      params.push(searchTerm, searchTerm);
      // Then add LIKE parameters
      const likePattern = `%${searchTerm}%`;
      params.push(likePattern, likePattern, likePattern);
    }

    // Add sorting
    const validSortFields = ['StockNumber', 'Year', 'Make', 'Model', 'Color', 'VIN'];
    if (validSortFields.includes(sortBy)) {
      query += ` ORDER BY v.${sortBy} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    } else {
      query += ` ORDER BY v.StockNumber ASC`;
    }

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    // Execute main query
    const [vehicles] = await newPool.query(query, params);
    
    // Get total count using SQL_CALC_FOUND_ROWS
    const [[{ total }]] = await newPool.query('SELECT FOUND_ROWS() as total');
    const totalPages = Math.ceil(total / limit);

    const response = { vehicles, total, totalPages };
    
    // Cache response
    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
    
    res.json(response);
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router; 