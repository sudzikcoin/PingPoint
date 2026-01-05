import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("ok");
  });

  test("root endpoint returns HTML", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain("PingPoint");
  });
});
