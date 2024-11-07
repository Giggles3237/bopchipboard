const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    // This configuration allows connection without proper SSL verification
    // Note: This is not recommended for production environments
    rejectUnauthorized: false
  }
});

// Convert pool to use promises
const promisePool = pool.promise();

module.exports = promisePool;
