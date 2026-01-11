import { beforeAll, afterAll, beforeEach } from "vitest";
import { resetDatabase } from "./utils/dbTestUtils";

process.env.AUTH_AUTO_CREATE_BROKER = "true";

beforeAll(async () => {
  console.log("[Test Setup] Starting test suite, resetting database...");
  await resetDatabase();
});

afterAll(async () => {
  console.log("[Test Setup] Test suite completed.");
});
