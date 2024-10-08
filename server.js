const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Define the path to your SSL certificate
const sslCertPath = path.join(__dirname, 'certs', 'DigiCertGlobalRootG2.crt.pem');

// Create a MySQL connection with SSL
const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  ssl: {
    ca: fs.readFileSync(sslCertPath),
    rejectUnauthorized: false // Allow self-signed certificates
  }
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL database', err);
  } else {
    console.log('Connected to MySQL database');
  }
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
  
  // Format the deliveryDate to 'YYYY-MM-DD'
  let formattedDeliveryDate = null;
  if (deliveryDate) {
    const date = new Date(deliveryDate);
    formattedDeliveryDate = date.toISOString().split('T')[0];
  }

  const query = `INSERT INTO vehicle_sales (clientName, stockNumber, year, make, model, color, advisor, delivered, deliveryDate, type) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.query(query, [clientName, stockNumber, year, make, model, color, advisor, delivered, formattedDeliveryDate, type], (err, result) => {
    if (err) {
      console.error('Error adding new sale:', err);
      res.status(400).json({ message: err.message });
    } else {
      res.status(201).json({ id: result.insertId, ...req.body });
    }
  });
});

app.put('/api/sales/:id', (req, res) => {
  const { clientName, stockNumber, year, make, model, color, advisor, delivered, deliveryDate, type } = req.body;
  
  // Format the deliveryDate to 'YYYY-MM-DD'
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
        res.json({ id: req.params.id, ...req.body });
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