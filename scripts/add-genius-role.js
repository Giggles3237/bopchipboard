require('dotenv').config();
const { oldPool } = require('../db');

async function main() {
  const [existing] = await oldPool.query('SELECT id FROM roles WHERE name = ?', ['Genius']);

  if (existing.length > 0) {
    console.log('Genius role already exists.');
    return;
  }

  await oldPool.query('INSERT INTO roles (name) VALUES (?)', ['Genius']);
  console.log('Genius role added.');
}

main()
  .catch((error) => {
    console.error('Failed to add Genius role:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await oldPool.end();
  });
