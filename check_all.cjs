const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Статус LD-2026-9596
  const { rows: [load9596] } = await pool.query(`
    SELECT load_number, status, delivered_at, updated_at, driver_id, driver_token
    FROM loads WHERE load_number = 'LD-2026-9596'
  `);
  console.log('LD-2026-9596 status:', JSON.stringify(load9596));

  // Все грузы driver_id = 9c6332f6-b2d9-47d0-aa97-dc46df357dba (трак 160)
  const { rows } = await pool.query(`
    SELECT load_number, status, pickup_eta, delivery_eta, driver_token, created_at
    FROM loads
    WHERE driver_id = '9c6332f6-b2d9-47d0-aa97-dc46df357dba'
    ORDER BY created_at DESC
    LIMIT 8
  `);
  console.log('ALL LOADS truck 160:', JSON.stringify(rows, null, 2));

  await pool.end();
}
main().catch(console.error);
