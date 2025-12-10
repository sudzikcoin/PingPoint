import { beforeAll, afterAll } from "vitest";
import { resetDatabase } from "./utils/dbTestUtils";

beforeAll(async () => {
  console.log("[Test Setup] Starting test suite, resetting database...");
  await resetDatabase();
});

afterAll(async () => {
  console.log("[Test Setup] Test suite completed.");
});
