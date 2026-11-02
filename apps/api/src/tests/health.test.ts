import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import type { AuthStore } from "../auth/types.js";

const authStore: AuthStore = {
  createPasswordAccount: async (email) => ({ id: "user-1", email, status: "ACTIVE" }),
  findPasswordAccount: async () => null,
  findOrCreateGoogleAccount: async (identity) => ({ id: "user-1", email: identity.email, status: "ACTIVE" }),
  recordFailedPasswordLogin: async () => {},
  createSession: async () => {},
  findSession: async () => null,
  revokeSession: async () => {},
};
const base = {
  siteName: "Test",
  corsOrigins: ["http://localhost:5173"],
  auth: {
    store: authStore,
    sessionSecret: "test-session-secret-at-least-32-characters",
    siteUrl: "http://localhost:5173",
    secureCookie: false,
  },
};

describe("GET /api/v1/health", () => {
  it("returns ok when database is reachable", async () => {
    const app = createApp({ ...base, checkDatabase: async () => true });
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
  });

  it("returns 503 with the standard error shape when database is down", async () => {
    const app = createApp({ ...base, checkDatabase: async () => false });
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("returns the standard 404 shape", async () => {
    const app = createApp({ ...base, checkDatabase: async () => true });
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("loadEnv", () => {
  it("rejects a short session secret", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "x", REDIS_URL: "y", SESSION_SECRET: "short" } as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_SECRET/);
  });

  it("allows an unset bootstrap email until Google sign-in is enabled", () => {
    const env = loadEnv({
      DATABASE_URL: "x",
      REDIS_URL: "y",
      SESSION_SECRET: "a-valid-session-secret-that-is-long-enough",
      BOOTSTRAP_ADMIN_EMAIL: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: "",
    } as NodeJS.ProcessEnv);
    expect(env.BOOTSTRAP_ADMIN_EMAIL).toBeUndefined();
  });

  it("requires a restricted bootstrap email when Google sign-in is configured", () => {
    expect(() => loadEnv({
      DATABASE_URL: "x",
      REDIS_URL: "y",
      SESSION_SECRET: "a-valid-session-secret-that-is-long-enough",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:4000/api/v1/auth/google/callback",
    } as NodeJS.ProcessEnv)).toThrow(/BOOTSTRAP_ADMIN_EMAIL/);
  });

  it("rejects partial R2 configuration", () => {
    expect(() => loadEnv({
      DATABASE_URL: "x",
      REDIS_URL: "y",
      SESSION_SECRET: "a-valid-session-secret-that-is-long-enough",
      R2_ACCOUNT_ID: "account",
    } as NodeJS.ProcessEnv)).toThrow(/R2_ACCOUNT_ID/);
  });

  it("allows all R2 settings to remain unset for mocked development", () => {
    const env = loadEnv({
      DATABASE_URL: "x",
      REDIS_URL: "y",
      SESSION_SECRET: "a-valid-session-secret-that-is-long-enough",
      R2_ACCOUNT_ID: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      R2_BUCKET: "",
    } as NodeJS.ProcessEnv);
    expect(env.R2_BUCKET).toBeUndefined();
  });

  it("validates R2 account IDs and bucket names before configuring storage", () => {
    expect(() => loadEnv({
      DATABASE_URL: "x",
      REDIS_URL: "y",
      SESSION_SECRET: "a-valid-session-secret-that-is-long-enough",
      R2_ACCOUNT_ID: "not-an-account-id",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "nkp-media",
    } as NodeJS.ProcessEnv)).toThrow(/R2_ACCOUNT_ID/);
  });
});
