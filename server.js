const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
<<<<<<< HEAD
require('dotenv').config();
const { newPool } = require('./db');
=======
const dotenv = require('dotenv');

dotenv.config();
>>>>>>> fb8dd278168c91cc8039da91f6d6f6312f637739

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

<<<<<<< HEAD
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

=======
// MySQL database connection
const db = mysql.createPool({
  host: process.env.MYSQL_HOST,     // Your Azure MySQL host
  user: process.env.MYSQL_USER,     // Your Azure MySQL username
  password: process.env.MYSQL_PASSWORD, // Your Azure MySQL password
  database: process.env.MYSQL_DATABASE, // Your database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    // For Azure MySQL, we need to disable certificate verification in dev
    rejectUnauthorized: false
  }
});

// Add error handling for the pool
db.on('error', (err) => {
  console.error('Database pool error:', err);
});

// Create table if not exists
const createTableQuery = `CREATE TABLE IF NOT EXISTS vehicle_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clientName VARCHAR(255),
  stockNumber VARCHAR(255) UNIQUE,
  year INT,
  make VARCHAR(255),
  model VARCHAR(255),
  color VARCHAR(255),
  advisor VARCHAR(255),
  delivered BOOLEAN,
  deliveryDate DATE,
  type VARCHAR(255)
)`;

db.query(createTableQuery, (err) => {
  if (err) {
    console.error('Error creating table:', err);
  } else {
    console.log('Table created or already exists');
  }
});

// Routes
app.get('/api/sales', (req, res) => {
  db.query('SELECT * FROM vehicle_sales', (err, results) => {
    if (err) {
      console.error('Error fetching sales:', err);
      res.status(500).json({ message: err.message });
    } else {
      // Trim the 'type' field
      const trimmedResults = results.map(row => ({
        ...row,
        type: row.type ? row.type.trim() : row.type
      }));
      console.log('Sample of trimmed data being sent:', trimmedResults.slice(0, 2));
      res.json(trimmedResults);
    }
  });
});

app.post('/api/sales', (req, res) => {
  const { clientName, stockNumber, year, make, model, color, advisor, delivered, deliveryDate, type } = req.body;
  
  // Format the deliveryDate
  let formattedDeliveryDate = null;
  if (deliveryDate) {
    const date = new Date(deliveryDate);
    formattedDeliveryDate = date.toISOString().split('T')[0]; // This will give 'YYYY-MM-DD'
  }

  const query = `INSERT INTO vehicle_sales (clientName, stockNumber, year, make, model, color, advisor, delivered, deliveryDate, type) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.query(query, [clientName, stockNumber, year, make, model, color, advisor, delivered, formattedDeliveryDate, type],
    (err, result) => {
      if (err) {
        console.error('Error adding new sale:', err);
        res.status(400).json({ message: err.message });
      } else {
        res.status(201).json({ id: result.insertId, ...req.body, deliveryDate: formattedDeliveryDate });
      }
    }
  );
});

app.put('/api/sales/:id', (req, res) => {
  const { clientName, stockNumber, year, make, model, color, advisor, delivered, deliveryDate, type } = req.body;
  
  // Format the deliveryDate
  let formattedDeliveryDate = null;
  if (deliveryDate) {
    const date = new Date(deliveryDate);
    formattedDeliveryDate = date.toISOString().split('T')[0];
  }

  const query = `UPDATE vehicle_sales SET 
                 clientName = ?, stockNumber = ?, year = ?, make = ?, model = ?, color = ?, 
                 advisor = ?, delivered = ?, deliveryDate = ?, type = ? 
                 WHERE id = ?`;
  db.query(query, [clientName, stockNumber, year, make, model, color, advisor, delivered, formattedDeliveryDate, type, req.params.id],
    (err, result) => {
      if (err) {
        console.error('Error updating sale:', err);
        res.status(400).json({ message: err.message });
      } else if (result.affectedRows === 0) {
        res.status(404).json({ message: 'Sale not found' });
      } else {
        res.json({ id: req.params.id, ...req.body, deliveryDate: formattedDeliveryDate });
      }
    }
  );
});

app.delete('/api/sales/:id', (req, res) => {
  db.query('DELETE FROM vehicle_sales WHERE id = ?', [req.params.id], (err, result) => {
    if (err) {
      console.error('Error deleting sale:', err);
      res.status(500).json({ message: err.message });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Sale not found' });
    } else {
      res.json({ message: 'Sale deleted successfully' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
>>>>>>> fb8dd278168c91cc8039da91f6d6f6312f637739
