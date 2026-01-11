import { beforeAll, afterAll } from "vitest";
import { resetDatabase } from "./utils/dbTestUtils";

process.env.AUTH_AUTO_CREATE_BROKER = "true";

function verifyTestDatabase(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[Test Setup] FATAL: Cannot run tests in production mode!");
  }
  
  const dbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || "";
  const dbName = new URL(dbUrl).pathname.slice(1);
  
  if (!/test|ci|tmp/i.test(dbName) && !process.env.DATABASE_URL_TEST) {
    console.warn("=".repeat(70));
    console.warn("[Test Setup] WARNING: Running tests against non-test database!");
    console.warn(`  Database: ${dbName}`);
    console.warn(`  Risk: Tests will TRUNCATE all tables!`);
    console.warn(`  Fix: Set DATABASE_URL_TEST to a dedicated test database`);
    console.warn("=".repeat(70));
  }
  
  console.log("[Test Setup] Running tests in NODE_ENV:", process.env.NODE_ENV || "test");
  console.log("[Test Setup] Database:", dbName);
}

beforeAll(async () => {
  verifyTestDatabase();
  console.log("[Test Setup] Starting test suite, resetting database...");
  await resetDatabase();
});

afterAll(async () => {
  console.log("[Test Setup] Test suite completed.");
});
