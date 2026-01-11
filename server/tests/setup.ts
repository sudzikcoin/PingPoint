import { beforeAll, afterAll } from "vitest";
import { resetDatabase } from "./utils/dbTestUtils";

process.env.AUTH_AUTO_CREATE_BROKER = "true";

function verifyTestDatabase(): void {
  const dbUrl = process.env.DATABASE_URL || "";
  if (process.env.NODE_ENV === "production") {
    throw new Error("[Test Setup] FATAL: Cannot run tests in production mode!");
  }
  console.log("[Test Setup] Running tests in NODE_ENV:", process.env.NODE_ENV || "undefined");
}

beforeAll(async () => {
  verifyTestDatabase();
  console.log("[Test Setup] Starting test suite, resetting database...");
  await resetDatabase();
});

afterAll(async () => {
  console.log("[Test Setup] Test suite completed.");
});
