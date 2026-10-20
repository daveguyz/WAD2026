/**
 * config/db.js
 * Creates a MySQL connection pool shared by the whole application.
 * All queries use placeholders (?) - prepared statements - to prevent SQL injection.
 */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'campuspulse',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true          // return DATETIME as 'YYYY-MM-DD HH:MM:SS' strings
});

module.exports = pool;
