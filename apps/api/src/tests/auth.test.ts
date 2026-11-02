import argon2 from "argon2";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { requirePermission } from "../auth/middleware.js";
import { AccountExistsError, type AuthPrincipal, type AuthStore, type GoogleProvider } from "../auth/types.js";
import { CmsProvenanceError, type CmsContent, type CmsStore } from "../cms/types.js";

const sessionSecret = "test-session-secret-at-least-32-characters";
const principal: AuthPrincipal = {
  id: "user-1",
  email: "reader@example.com",
  roles: [{ name: "member", permissions: ["content:read"] }],
  permissions: ["content:read"],
};

function makeStore(overrides: Partial<AuthStore> = {}): AuthStore {
  return {
    createPasswordAccount: async (email) => ({ id: "user-1", email, status: "ACTIVE" }),
    findPasswordAccount: async () => null,
    findOrCreateGoogleAccount: async (identity) => ({ id: "user-1", email: identity.email, status: "ACTIVE" }),
    recordFailedPasswordLogin: async () => {},
    createSession: async () => {},
    findSession: async () => principal,
    revokeSession: async () => {},
    ...overrides,
  };
}

function makeApp(store: AuthStore, googleProvider?: GoogleProvider, cmsStore?: CmsStore) {
  return createApp({
    checkDatabase: async () => true,
    siteName: "Test",
    corsOrigins: ["http://localhost:5173"],
    auth: {
      store,
      sessionSecret,
      siteUrl: "http://localhost:5173",
      secureCookie: false,
      bootstrapAdminEmail: "admin@example.com",
      googleProvider,
    },
    cmsStore,
  });
}

describe("authentication routes", () => {
  it("creates an active password account and a hashed-token session", async () => {
    const createPasswordAccount = vi.fn(async (email: string, passwordHash: string) => {
      expect(await argon2.verify(passwordHash, "correct horse battery staple")).toBe(true);
      return { id: "user-1", email, status: "ACTIVE" as const };
    });
    const createSession = vi.fn(async () => {});
    const app = makeApp(makeStore({ createPasswordAccount, createSession }));

    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "Reader@Example.com", password: "correct horse battery staple" });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ id: "user-1", email: "reader@example.com" });
    expect(response.headers["set-cookie"][0]).toMatch(/nkp_session=[a-f0-9]{64}; HttpOnly; SameSite=Lax; Path=\/api\/v1/);
    expect(createPasswordAccount).toHaveBeenCalledWith(
      "reader@example.com",
      expect.any(String),
      undefined,
    );
    expect(createSession).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
      "password",
    );
  });

  it("rejects short registration passwords and reports duplicate accounts", async () => {
    const app = makeApp(makeStore({
      createPasswordAccount: async () => { throw new AccountExistsError(); },
    }));

    const invalid = await request(app).post("/api/v1/auth/register").send({
      email: "reader@example.com",
      password: "too-short",
    });
    expect(invalid.status).toBe(400);

    const duplicate = await request(app).post("/api/v1/auth/register").send({
      email: "reader@example.com",
      password: "long enough password",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("ACCOUNT_EXISTS");
  });

  it("logs in with a password and uses a generic credential error", async () => {
    const passwordHash = await argon2.hash("correct horse battery staple");
    const recordFailedPasswordLogin = vi.fn(async () => {});
    const app = makeApp(makeStore({
      findPasswordAccount: async (email) => ({
        id: "user-1",
        email,
        passwordHash,
        status: "ACTIVE",
      }),
      recordFailedPasswordLogin,
    }));

    const valid = await request(app).post("/api/v1/auth/login").send({
      email: "reader@example.com",
      password: "correct horse battery staple",
    });
    expect(valid.status).toBe(200);
    expect(valid.headers["set-cookie"][0]).toContain("HttpOnly");

    const invalid = await request(app).post("/api/v1/auth/login").send({
      email: "reader@example.com",
      password: "incorrect password",
    });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(recordFailedPasswordLogin).toHaveBeenCalledOnce();
  });

  it("requires a valid cookie for the current-user endpoint and clears it on logout", async () => {
    const revokeSession = vi.fn(async () => {});
    const app = makeApp(makeStore({ revokeSession }));

    const unauthorized = await request(app).get("/api/v1/auth/me");
    expect(unauthorized.status).toBe(401);

    const currentUser = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `nkp_session=${"a".repeat(64)}`);
    expect(currentUser.status).toBe(200);
    expect(currentUser.body.data).toEqual(principal);

    const signedOut = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", `nkp_session=${"a".repeat(64)}`);
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers["set-cookie"][0]).toContain("Max-Age=0");
    expect(revokeSession).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), expect.any(Date));
  });

  it("checks Google OAuth state and provisions only through the verified provider", async () => {
    const findOrCreateGoogleAccount = vi.fn(async () => ({
      id: "google-user",
      email: "admin@example.com",
      status: "ACTIVE" as const,
    }));
    const googleProvider: GoogleProvider = {
      authorizationUrl: (state) => `https://accounts.google.test/authorize?state=${state}`,
      authenticate: async () => ({ subject: "google-subject", email: "admin@example.com" }),
    };
    const app = makeApp(makeStore({ findOrCreateGoogleAccount }), googleProvider);

    const start = await request(app).get("/api/v1/auth/google?lang=ne");
    expect(start.status).toBe(302);
    const authorization = new URL(start.headers.location);
    const state = authorization.searchParams.get("state");
    const stateCookie = start.headers["set-cookie"][0].split(";")[0];
    expect(state).toMatch(/^[a-f0-9]{64}$/);

    const badState = await request(app)
      .get(`/api/v1/auth/google/callback?state=${"b".repeat(64)}&code=sample`)
      .set("Cookie", stateCookie);
    expect(badState.status).toBe(400);

    const callback = await request(app)
      .get(`/api/v1/auth/google/callback?state=${state}&code=sample`)
      .set("Cookie", stateCookie);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("http://localhost:5173/ne/login?google=success");
    expect(callback.headers["set-cookie"]).toHaveLength(2);
    expect(findOrCreateGoogleAccount).toHaveBeenCalledWith(
      { subject: "google-subject", email: "admin@example.com" },
      "admin@example.com",
    );
  });

  it("enforces explicit permissions and the administrator wildcard", async () => {
    const app = express();
    app.get(
      "/audit",
      (req, _res, next) => {
        req.auth = principal;
        next();
      },
      requirePermission("audit:read"),
      (_req, res) => res.sendStatus(204),
    );
    app.get(
      "/admin",
      (req, _res, next) => {
        req.auth = { ...principal, permissions: ["*"] };
        next();
      },
      requirePermission("audit:read"),
      (_req, res) => res.sendStatus(204),
    );

    expect((await request(app).get("/audit")).status).toBe(403);
    expect((await request(app).get("/admin")).status).toBe(204);
  });

  it("protects CMS routes with permissions and reports publishing provenance errors", async () => {
    const cookie = `nkp_session=${"c".repeat(64)}`;
    const cmsStore: CmsStore = {
      list: async () => ({ items: [], nextCursor: null }),
      get: async () => null,
      createDraft: vi.fn(async (): Promise<CmsContent> => ({
        id: "00000000-0000-4000-8000-000000000001",
        type: "ARTICLE",
        slug: "first-article",
        status: "DRAFT",
        authorId: "user-1",
        sourceUrl: null,
        rights: null,
        rightsType: null,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        translations: [{ language: "en", title: "Title", body: "Body" }],
      })),
      updateDraft: async () => null,
      submitForReview: async () => null,
      publish: async () => { throw new CmsProvenanceError(["Add a source URL."]); },
      returnToDraft: async () => null,
    };
    const author: AuthPrincipal = {
      ...principal,
      permissions: ["content:read", "content:create"],
    };
    const authorApp = makeApp(makeStore({ findSession: async () => author }), undefined, cmsStore);

    const deniedPublish = await request(authorApp)
      .post("/api/v1/cms/content/00000000-0000-4000-8000-000000000001/publish")
      .set("Cookie", cookie);
    expect(deniedPublish.status).toBe(403);

    const created = await request(authorApp)
      .post("/api/v1/cms/content")
      .set("Cookie", cookie)
      .send({
        type: "ARTICLE",
        slug: "first-article",
        translations: [{ language: "en", title: "Title", body: "Body" }],
      });
    expect(created.status).toBe(201);
    expect(cmsStore.createDraft).toHaveBeenCalledWith(
      author.id,
      expect.objectContaining({ slug: "first-article" }),
    );

    const adminApp = makeApp(makeStore({
      findSession: async () => ({ ...author, permissions: ["*"] }),
    }), undefined, cmsStore);
    const blockedPublish = await request(adminApp)
      .post("/api/v1/cms/content/00000000-0000-4000-8000-000000000001/publish")
      .set("Cookie", cookie);
    expect(blockedPublish.status).toBe(422);
    expect(blockedPublish.body.error.code).toBe("PROVENANCE_REQUIRED");
  });
});
