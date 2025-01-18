const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { newPool } = require('./db');

const app = express();

// Middleware
app.use(cors({
    origin: ['https://bopchips.netlify.app', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const salesRoutes = require('./routes/sales');
const notificationsRoutes = require('./routes/notifications');
const activitiesRoutes = require('./routes/activities');
const goalsRoutes = require('./routes/goals');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/goals', goalsRoutes);

/**
 * NEW: SEARCH ROUTE FOR unifiedvehicledata
 * Example: GET /api/unifiedvehicles?searchTerm=... 
 */
app.get('/api/unifiedvehicles', async (req, res) => {
    try {
        const { searchTerm, limit } = req.query;
        console.log('Received request for unified vehicles. SearchTerm:', searchTerm, 'Limit:', limit);

        const query = `
            SELECT v.*
            FROM latest_vehicle_summary v
            WHERE 
                StockNumber LIKE ? OR
                Make LIKE ? OR
                Model LIKE ? OR
                VIN LIKE ?
            ORDER BY Year DESC
            LIMIT ?
        `;

        const searchPattern = `%${searchTerm || ''}%`;
        const queryParams = [
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            parseInt(limit) || 1000
        ];

        console.log('Executing query:', query);
        console.log('Query parameters:', queryParams);

        const [rows] = await newPool.query(query, queryParams);
        console.log(`Query returned ${rows.length} results`);

        res.json(rows);
    } catch (error) {
        console.error('Error in /api/unifiedvehicles:', error);
        res.status(500).json({ 
            error: 'Database error',
            details: error.message,
            stack: error.stack
        });
    }
});

app.get('/api/keys', async (req, res) => {
    try {
        const [rows] = await newPool.query(`
            SELECT 
                k.*,
                v.Make,
                v.Model,
                v.Year,
                v.Color
            FROM latest_key_data k
            LEFT JOIN latest_vehicle_summary v ON k.StockNumber = v.StockNumber
            ORDER BY k.UpdatedAt DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching key data:', error);
        res.status(500).json({ 
            error: 'Database error',
            details: error.message 
        });
    }
});

app.get('/api/keys/:stockNumber', async (req, res) => {
    try {
        const { stockNumber } = req.params;
        console.log('Fetching key data for stock number:', stockNumber);
        
        // First get the base vehicle data
        const [vehicleRows] = await newPool.query(`
            SELECT v.*
            FROM latest_vehicle_summary v
            WHERE v.StockNumber = ?
            LIMIT 1
        `, [stockNumber]);

        if (!vehicleRows || vehicleRows.length === 0) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        // First key query
        const [firstKeyRows] = await newPool.query(`
            SELECT 
                Status as status,
                User as user,
                \`Checkout Local Time\` as checkoutTime,
                description as reason,
                CONCAT(\`system\`, ' - ', location) as systemLocation
            FROM keyperdata
            WHERE StockNumber = ?
            ORDER BY my_row_id DESC
            LIMIT 1
        `, [stockNumber]);

        // Second key query
        const [secondKeyRows] = await newPool.query(`
            SELECT 
                Status as status,
                User as user,
                \`Checkout Local Time\` as checkoutTime,
                description as reason,
                CONCAT(\`system\`, ' - ', location) as systemLocation
            FROM keyperdata_second_key
            WHERE StockNumber = ?
            ORDER BY my_row_id DESC
            LIMIT 1
        `, [stockNumber]);

        // Create response object with all vehicle data and key records
        const responseData = {
            ...vehicleRows[0],
            KeyRecords: [
                firstKeyRows[0] || null,
                secondKeyRows[0] || null
            ].filter(Boolean)
        };

        res.json(responseData);
    } catch (error) {
        console.error('Error fetching key data:', error);
        res.status(500).json({ 
            error: 'Database error',
            details: error.message
        });
    }
});

app.get('/api/unifiedvehicles/keys/:stockNumber', async (req, res) => {
    try {
        const { stockNumber } = req.params;
        
        const [rows] = await newPool.query(`
            SELECT *
            FROM latest_key_data
            WHERE name LIKE ?
            ORDER BY \`Check-Out Date\` DESC
        `, [`${stockNumber}.%`]);

        console.log('Key data found for stock number:', stockNumber, rows);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching key data:', error);
        res.status(500).json({ 
            error: 'Database error',
            details: error.message 
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

