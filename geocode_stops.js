const { Pool } = require('pg');
require('dotenv').config({ path: '/root/PingPoint/.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function geocode(address) {
  const encoded = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PingPoint/1.0' } });
  const data = await res.json();
  if (data && data[0]) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }
  return null;
}

async function main() {
  const { rows } = await pool.query(`
    SELECT id, full_address, city, state FROM stops 
    WHERE lat IS NULL 
    AND (full_address IS NOT NULL AND full_address != '' OR city IS NOT NULL)
    ORDER BY created_at DESC LIMIT 50
  `);
  
  console.log(`Found ${rows.length} stops without coords`);
  
  for (const stop of rows) {
    const address = stop.full_address || `${stop.city}, ${stop.state}`;
    try {
      const coords = await geocode(address);
      if (coords) {
        await pool.query(
          `UPDATE stops SET lat = $1, lng = $2 WHERE id = $3`,
          [coords.lat, coords.lng, stop.id]
        );
        console.log(`OK: ${address} → ${coords.lat}, ${coords.lng}`);
      } else {
        console.log(`FAIL: ${address}`);
      }
      // Nominatim rate limit
      await new Promise(r => setTimeout(r, 1100));
    } catch(e) {
      console.error(`ERR ${stop.id}: ${e.message}`);
    }
  }
  
  await pool.end();
  console.log('Done');
}

main();
