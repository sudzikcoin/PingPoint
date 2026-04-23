const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const { rows } = await pool.query(`
    SELECT l.load_number, l.status, l.pickup_eta, l.delivery_eta, l.driver_token,
           s.type, s.city, s.state, s.arrived_at, s.departed_at, s.lat, s.lng
    FROM loads l
    LEFT JOIN stops s ON s.load_id = l.id
    WHERE l.load_number = 'LD-2026-9596'
    ORDER BY s.sequence
  `);
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}
main().catch(console.error);
