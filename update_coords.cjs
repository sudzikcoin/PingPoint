const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  // Grand Rapids, MI координаты (город — для геофенса достаточно)
  const r = await pool.query(`
    UPDATE stops SET lat = 42.9632425, lng = -85.6678639
    WHERE id = (
      SELECT s.id FROM stops s
      JOIN loads l ON l.id = s.load_id
      WHERE l.load_number = 'LD-2026-1478' AND s.type = 'DELIVERY'
      LIMIT 1
    )
    RETURNING id, city, state, lat, lng
  `);
  console.log('Updated:', JSON.stringify(r.rows[0]));
  await pool.end();
}
main().catch(console.error);
