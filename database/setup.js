/**
 * database/setup.js
 * One-command database installer:  npm run setup-db
 * Runs schema.sql then seed.sql against the MySQL server set in .env
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  for (const file of ['schema.sql', 'seed.sql']) {
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
    process.stdout.write(`Running ${file} ... `);
    await conn.query(sql);
    console.log('done');
  }
  await conn.end();
  console.log('\nDatabase "campuspulse" is ready.');
  console.log('Admin login  : admin@nust.na / Admin@123');
  console.log('Student login: 200000@nust.na / Student@123');
}

run().catch(err => {
  console.error('\nDatabase setup failed:', err.message);
  console.error('Check that MySQL is running and the DB_* values in .env are correct.');
  process.exit(1);
});
