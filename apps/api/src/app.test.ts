import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", service: "yachtway-crm-api" });
  });
});
