const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Смотрим drivers с truck_number = 160
  const drivers = await pool.query(`SELECT id, name, truck_number FROM drivers WHERE truck_number = '160'`);
  console.log('DRIVERS truck 160:', JSON.stringify(drivers.rows));

  // Если нет — ищем по имени Dmitrii
  const byName = await pool.query(`SELECT id, name, truck_number FROM drivers WHERE name ILIKE '%dmitrii%' OR name ILIKE '%sudz%'`);
  console.log('DMITRII drivers:', JSON.stringify(byName.rows));

  // Последние 5 loads вообще
  const loads = await pool.query(`
    SELECT l.id, l.load_number, l.status, l.pickup_eta, l.driver_token,
           d.name as driver_name, d.truck_number
    FROM loads l LEFT JOIN drivers d ON d.id = l.driver_id
    ORDER BY l.created_at DESC LIMIT 5
  `);
  console.log('LATEST LOADS:', JSON.stringify(loads.rows, null, 2));
  
  // Проверяем next-load endpoint напрямую
  const nextLoad = await pool.query(`
    SELECT l.load_number, l.status, l.pickup_eta, l.driver_token, d.truck_number
    FROM loads l LEFT JOIN drivers d ON d.id = l.driver_id
    WHERE l.status IN ('PLANNED','IN_TRANSIT','ACTIVE')
    ORDER BY l.pickup_eta ASC NULLS LAST LIMIT 5
  `);
  console.log('ACTIVE LOADS:', JSON.stringify(nextLoad.rows, null, 2));
  
  await pool.end();
}
main().catch(console.error);
