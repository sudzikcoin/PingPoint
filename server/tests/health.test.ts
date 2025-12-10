import { describe, it, expect } from "vitest";
import { getTestRequest } from "./utils/testApp";

describe("Health Endpoint", () => {
  it("should return status ok", async () => {
    const request = await getTestRequest();
    
    const response = await request.get("/api/health");
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(response.body).toHaveProperty("timestamp");
  });
});
