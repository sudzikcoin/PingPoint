const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Все грузы трака 160
  const { rows } = await pool.query(`
    SELECT l.id, l.load_number, l.status, l.pickup_eta, l.delivery_eta, l.driver_token
    FROM loads l
    JOIN drivers d ON d.id = l.driver_id
    WHERE d.truck_number = '160'
    ORDER BY l.pickup_eta ASC NULLS LAST
    LIMIT 10
  `);
  console.log('TRUCK 160 LOADS:', JSON.stringify(rows, null, 2));
  await pool.end();
}
main().catch(console.error);
