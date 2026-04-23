const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Помечаем 9596 как DELIVERED
  const { rows: [updated] } = await pool.query(`
    UPDATE loads 
    SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
    WHERE load_number = 'LD-2026-9596'
    RETURNING load_number, status, delivered_at
  `);
  console.log('Updated:', JSON.stringify(updated));

  // Проверяем 1478 — текущий груз
  const { rows } = await pool.query(`
    SELECT l.load_number, l.status, l.pickup_eta, l.delivery_eta, l.driver_token,
           s.type, s.city, s.state, s.full_address, s.lat, s.lng,
           s.arrived_at, s.departed_at
    FROM loads l
    LEFT JOIN stops s ON s.load_id = l.id
    WHERE l.load_number = 'LD-2026-1478'
    ORDER BY s.sequence
  `);
  console.log('LD-2026-1478:', JSON.stringify(rows, null, 2));

  await pool.end();
}
main().catch(console.error);
