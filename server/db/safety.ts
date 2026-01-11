import { URL } from "url";

export interface DatabaseInfo {
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  provider: string;
}

export interface SafetyParams {
  nodeEnv: string;
  databaseUrl: string;
  allowLocalInProd?: boolean;
  allowTestDbInProd?: boolean;
}

const UNSAFE_PROD_DB_PATTERNS = [
  /test/i,
  /ci/i,
  /tmp/i,
  /local/i,
  /dev/i,
  /sample/i,
  /example/i,
];

const UNSAFE_PROD_USER_PATTERNS = [
  /^test$/i,
  /^ci$/i,
  /^dev$/i,
];

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

export function parseDatabaseUrl(databaseUrl: string): DatabaseInfo {
  try {
    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = parseInt(url.port || "5432", 10);
    const database = url.pathname.slice(1);
    const user = url.username;
    const ssl = url.searchParams.get("sslmode") === "require" || 
                url.searchParams.get("ssl") === "true" ||
                url.protocol === "postgres:";
    
    let provider = "external";
    if (host.includes("neon") || host.includes("replit")) {
      provider = "neon/replit";
    } else if (host.includes("supabase")) {
      provider = "supabase";
    } else if (host.includes("railway")) {
      provider = "railway";
    } else if (host.includes("render")) {
      provider = "render";
    } else if (LOCAL_HOSTS.includes(host)) {
      provider = "local";
    } else if (host === "db" || host.includes("pingpoint-db")) {
      provider = "docker";
    }
    
    return { host, port, database, user, ssl, provider };
  } catch (err) {
    throw new Error(`Invalid DATABASE_URL format: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

export function assertDatabaseSafety(params: SafetyParams): DatabaseInfo {
  const { nodeEnv, databaseUrl, allowLocalInProd = false, allowTestDbInProd = false } = params;
  
  if (!databaseUrl) {
    throw new Error("[DB Safety] DATABASE_URL is required but not set");
  }
  
  const info = parseDatabaseUrl(databaseUrl);
  
  if (!info.database) {
    throw new Error("[DB Safety] DATABASE_URL must specify a database name");
  }
  
  if (nodeEnv === "production") {
    if (!allowLocalInProd && LOCAL_HOSTS.includes(info.host)) {
      throw new Error(
        `[DB Safety] PRODUCTION cannot use localhost database!\n` +
        `  Host: ${info.host}\n` +
        `  Fix: Set DATABASE_URL to a production PostgreSQL instance\n` +
        `  Allowed: Neon, Supabase, Railway, Render, or other managed Postgres`
      );
    }
    
    if (!allowTestDbInProd) {
      for (const pattern of UNSAFE_PROD_DB_PATTERNS) {
        if (pattern.test(info.database)) {
          throw new Error(
            `[DB Safety] PRODUCTION database name looks unsafe: "${info.database}"\n` +
            `  Pattern matched: ${pattern}\n` +
            `  Fix: Use a production database (not test/dev/local)`
          );
        }
      }
      
      for (const pattern of UNSAFE_PROD_USER_PATTERNS) {
        if (pattern.test(info.user)) {
          throw new Error(
            `[DB Safety] PRODUCTION database user looks unsafe: "${info.user}"\n` +
            `  Fix: Use a production database user (not test/dev)`
          );
        }
      }
    }
  }
  
  if (nodeEnv === "test") {
    const isTestDb = /test|ci|tmp/i.test(info.database);
    if (!isTestDb) {
      console.warn("=".repeat(70));
      console.warn("[DB Safety] WARNING: Test environment using non-test database!");
      console.warn(`  Database: ${info.database}`);
      console.warn(`  Expected: Database name should contain 'test' or 'ci'`);
      console.warn(`  Risk: Tests may corrupt development/production data!`);
      console.warn(`  Fix: Set DATABASE_URL_TEST to a dedicated test database`);
      console.warn("=".repeat(70));
    }
  }
  
  return info;
}

export function formatDatabaseInfo(info: DatabaseInfo): string {
  return `host=${info.host} port=${info.port} db=${info.database} user=${info.user} provider=${info.provider}`;
}

export function logDatabaseSafety(info: DatabaseInfo, nodeEnv: string): void {
  console.log(`[DB] Using PostgreSQL ${formatDatabaseInfo(info)} env=${nodeEnv}`);
}

export async function getDatabaseFingerprint(pool: { query: (sql: string) => Promise<{ rows: any[] }> }): Promise<string> {
  try {
    const result = await pool.query(`
      SELECT 
        current_database() as db,
        current_user as usr,
        inet_server_addr() as addr,
        inet_server_port() as port,
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count
    `);
    
    const row = result.rows[0];
    return `db=${row.db} user=${row.usr} addr=${row.addr || 'local'} port=${row.port || '?'} tables=${row.table_count}`;
  } catch (err) {
    return `fingerprint unavailable: ${err instanceof Error ? err.message : "unknown"}`;
  }
}
