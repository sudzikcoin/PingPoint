const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const currentToken = 'drv_3d829945bff2414e10f10006';
  
  // Текущий груз
  const { rows: [current] } = await pool.query(`
    SELECT id, load_number, status, broker_id, driver_id, driver_token
    FROM loads WHERE driver_token = $1
  `, [currentToken]);
  console.log('Current load:', JSON.stringify(current));

  // Симулируем: если бы статус был DELIVERED — нашёлся бы следующий?
  const { rows: next } = await pool.query(`
    SELECT load_number, status, pickup_eta, driver_token, broker_id, driver_id
    FROM loads
    WHERE id != $1
      AND broker_id = $2
      AND status IN ('PLANNED','IN_TRANSIT','AT_PICKUP')
    ORDER BY COALESCE(pickup_eta, created_at) ASC
    LIMIT 3
  `, [current.id, current.broker_id]);
  console.log('Next loads (same broker):', JSON.stringify(next, null, 2));

  // Проверяем все грузы этого брокера
  const { rows: brokerLoads } = await pool.query(`
    SELECT load_number, status, pickup_eta, driver_id, driver_token
    FROM loads WHERE broker_id = $1
    ORDER BY created_at DESC LIMIT 5
  `, [current.broker_id]);
  console.log('All broker loads (recent):', JSON.stringify(brokerLoads, null, 2));

  await pool.end();
}
main().catch(console.error);
