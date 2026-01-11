import { getEffectiveDatabaseUrl } from "../server/config/boot";
import { parseDatabaseUrl, formatDatabaseInfo, getDatabaseFingerprint } from "../server/db/safety";
import pg from "pg";

async function main() {
  const nodeEnv = process.env.NODE_ENV || "development";
  console.log("=".repeat(60));
  console.log("[DB Info] NODE_ENV:", nodeEnv);
  
  try {
    const databaseUrl = getEffectiveDatabaseUrl();
    const info = parseDatabaseUrl(databaseUrl);
    
    console.log("[DB Info]", formatDatabaseInfo(info));
    
    const pool = new pg.Pool({ connectionString: databaseUrl });
    
    try {
      const fingerprint = await getDatabaseFingerprint(pool);
      console.log("[DB Info] Fingerprint:", fingerprint);
      
      const tableResult = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      console.log("[DB Info] Tables (%d):", tableResult.rows.length);
      tableResult.rows.forEach(row => console.log("  -", row.table_name));
      
    } finally {
      await pool.end();
    }
    
  } catch (err) {
    console.error("[DB Info] Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
  
  console.log("=".repeat(60));
}

main();
