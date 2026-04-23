const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function geocode(address) {
  const encoded = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PingPoint/1.0' } });
  const data = await res.json();
  if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  return null;
}

async function main() {
  // Геокодируем все stops без координат для LD-2026-1478
  const { rows } = await pool.query(`
    SELECT id, full_address, city, state FROM stops
    WHERE lat IS NULL
    AND load_id = (SELECT id FROM loads WHERE load_number = 'LD-2026-1478')
  `);
  
  for (const stop of rows) {
    const address = stop.full_address || `${stop.city}, ${stop.state}`;
    const coords = await geocode(address);
    if (coords) {
      await pool.query(`UPDATE stops SET lat=$1, lng=$2 WHERE id=$3`, [coords.lat, coords.lng, stop.id]);
      console.log(`OK: ${address} → ${coords.lat}, ${coords.lng}`);
    } else {
      console.log(`FAIL: ${address}`);
    }
    await new Promise(r => setTimeout(r, 1100));
  }
  
  // Также геокодируем все остальные stops без координат (в фоне)
  const { rows: allNull } = await pool.query(`
    SELECT id, full_address, city, state FROM stops
    WHERE lat IS NULL AND (full_address != '' OR city IS NOT NULL)
    LIMIT 30
  `);
  console.log(`\nGeocoding ${allNull.length} more stops...`);
  for (const stop of allNull) {
    const address = stop.full_address || `${stop.city}, ${stop.state}`;
    const coords = await geocode(address);
    if (coords) {
      await pool.query(`UPDATE stops SET lat=$1, lng=$2 WHERE id=$3`, [coords.lat, coords.lng, stop.id]);
      console.log(`OK: ${address}`);
    }
    await new Promise(r => setTimeout(r, 1100));
  }

  await pool.end();
  console.log('Done');
}
main().catch(console.error);
