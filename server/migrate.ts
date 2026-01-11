import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@shared/schema";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { getEffectiveDatabaseUrl } from "./config/boot";
import { getDatabaseFingerprint } from "./db/safety";

const { Pool } = pg;

async function waitForDatabase(maxRetries = 30, delayMs = 1000): Promise<pg.Pool> {
  const pool = new Pool({ connectionString: getEffectiveDatabaseUrl() });
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log("[DB] Database connection established");
      return pool;
    } catch (err: any) {
      console.log(`[DB] Waiting for database... (${i + 1}/${maxRetries})`);
      if (i === maxRetries - 1) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error("Unexpected: exceeded max retries");
}

async function getTableCount(pool: pg.Pool): Promise<number> {
  const result = await pool.query(`
    SELECT COUNT(*) as count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  return parseInt(result.rows[0].count);
}

async function getMigrationCount(pool: pg.Pool): Promise<number> {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM "__drizzle_migrations"');
    return parseInt(result.rows[0].count);
  } catch {
    return 0;
  }
}

async function getAppliedMigrations(pool: pg.Pool): Promise<string[]> {
  try {
    const result = await pool.query('SELECT hash FROM "__drizzle_migrations" ORDER BY id');
    return result.rows.map(r => r.hash);
  } catch {
    return [];
  }
}

function getPendingMigrations(migrationsPath: string, applied: string[]): string[] {
  const journalPath = path.join(migrationsPath, 'meta', '_journal.json');
  if (!existsSync(journalPath)) return [];
  
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const all = journal.entries.map((e: any) => e.tag);
  return all.filter((tag: string) => !applied.includes(tag));
}

async function markMigrationsApplied(pool: pg.Pool, migrations: string[], migrationsPath: string): Promise<void> {
  const journalPath = path.join(migrationsPath, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  
  for (const tag of migrations) {
    const entry = journal.entries.find((e: any) => e.tag === tag);
    const existing = await pool.query('SELECT 1 FROM "__drizzle_migrations" WHERE hash = $1', [tag]);
    
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [tag, entry?.when || Date.now()]
      );
      console.log("[DB] Marked migration as applied:", tag);
    }
  }
}

function logDatabaseInfo(): void {
  try {
    const dbUrl = getEffectiveDatabaseUrl();
    const url = new URL(dbUrl);
    const redacted = `${url.protocol}//${url.username}:***@${url.hostname}:${url.port || 5432}${url.pathname}`;
    console.log("[DB] Connection:", redacted);
    console.log("[DB] NODE_ENV:", process.env.NODE_ENV || "undefined");
    console.log("[DB] Host:", url.hostname);
    console.log("[DB] Database:", url.pathname.slice(1));
    console.log("[DB] User:", url.username);
    
    if (url.hostname.includes("replit") || url.hostname.includes("neon")) {
      console.log("[DB] Provider: Replit/Neon managed database");
    } else if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      console.log("[DB] Provider: Local PostgreSQL");
    } else {
      console.log("[DB] Provider: External");
    }
  } catch {
    console.log("[DB] Connection: <invalid or unparseable DATABASE_URL>");
  }
}

export async function ensureDatabase(): Promise<void> {
  console.log("[DB] Starting database migration check...");
  logDatabaseInfo();
  
  const disableAutoMigrations = process.env.DISABLE_AUTO_MIGRATIONS === "true" || 
    (process.env.NODE_ENV === "production" && process.env.DISABLE_AUTO_MIGRATIONS !== "false");
  
  const pool = await waitForDatabase();
  const migrationsPath = path.join(process.cwd(), 'migrations');
  const hasMigrations = existsSync(migrationsPath);
  
  try {
    const tableCount = await getTableCount(pool);
    const appliedMigrations = await getAppliedMigrations(pool);
    
    console.log("[DB] State: tables=%d, appliedMigrations=%d", tableCount, appliedMigrations.length);
    
    const fingerprint = await getDatabaseFingerprint(pool);
    console.log("[DB] Fingerprint:", fingerprint);
    
    if (disableAutoMigrations) {
      console.log("[DB] Auto-migrations disabled (DISABLE_AUTO_MIGRATIONS=true or production)");
      console.log("[DB] Run migrations manually: npm run db:migrate");
      return;
    }
    
    if (!hasMigrations) {
      if (tableCount === 0) {
        if (process.env.NODE_ENV === "production") {
          console.error("[DB] FATAL: No migrations folder and no tables in production");
          console.error("[DB] Production requires migrations. Run: npm run db:generate");
          throw new Error("Cannot initialize production database without migrations");
        }
        
        console.log("[DB] No migrations folder and no tables - running db:push (dev only)...");
        
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        await execAsync('npx drizzle-kit push --force', {
          env: { ...process.env },
          timeout: 120000
        });
        console.log("[DB] Schema push completed");
      } else {
        console.log("[DB] Tables exist, no migrations folder - using existing schema");
      }
      return;
    }
    
    const pending = getPendingMigrations(migrationsPath, appliedMigrations);
    console.log("[DB] Pending migrations:", pending.length > 0 ? pending.join(', ') : 'none');
    
    if (tableCount > 0 && appliedMigrations.length === 0 && pending.length > 0) {
      console.log("[DB] Existing database without migration history (created via db:push)");
      
      const baselineMigration = pending.find(m => m.startsWith('0000'));
      
      if (baselineMigration) {
        console.log("[DB] Marking ONLY baseline migration as applied:", baselineMigration);
        await markMigrationsApplied(pool, [baselineMigration], migrationsPath);
        
        const remainingPending = getPendingMigrations(migrationsPath, await getAppliedMigrations(pool));
        
        if (remainingPending.length > 0) {
          console.log("[DB] Running %d remaining migration(s):", remainingPending.length);
          const db = drizzle(pool, { schema });
          await migrate(db, { migrationsFolder: migrationsPath });
          console.log("[DB] Migrations completed successfully");
        } else {
          console.log("[DB] Database is current after baseline marking");
        }
      } else {
        console.error("[DB] FATAL: No baseline (0000) migration found.");
        console.error("[DB] Cannot establish migration history for existing database.");
        throw new Error("No baseline migration found - cannot reconcile existing database");
      }
    } else if (pending.length > 0) {
      console.log("[DB] Running %d pending migration(s)...", pending.length);
      const db = drizzle(pool, { schema });
      await migrate(db, { migrationsFolder: migrationsPath });
      console.log("[DB] Migrations completed successfully");
    } else {
      console.log("[DB] Database is up to date");
    }
    
    const verifyResult = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log("[DB] Tables:", verifyResult.rows.map(r => r.table_name).join(', '));
    
  } catch (err: any) {
    console.error("[DB] Migration check failed:", err.message);
    throw err;
  } finally {
    await pool.end();
  }
}
