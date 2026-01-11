import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { getEffectiveDatabaseUrl } from "./config/boot";

const { Pool } = pg;

const databaseUrl = getEffectiveDatabaseUrl();
export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });
