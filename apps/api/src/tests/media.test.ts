import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { AuthPrincipal, AuthStore } from "../auth/types.js";
import type { MediaStorage, MediaStore } from "../media/types.js";

const sessionSecret = "test-session-secret-at-least-32-characters";
const mediaPrincipal: AuthPrincipal = {
  id: "staff-user",
  email: "staff@example.com",
  roles: [{ name: "editor", permissions: ["media:upload", "media:read"] }],
  permissions: ["media:upload", "media:read"],
};

const authStore: AuthStore = {
  createPasswordAccount: async (email) => ({ id: "user-1", email, status: "ACTIVE" }),
  findPasswordAccount: async () => null,
  findOrCreateGoogleAccount: async (identity) => ({ id: "user-1", email: identity.email, status: "ACTIVE" }),
  recordFailedPasswordLogin: async () => {},
  createSession: async () => {},
  findSession: async () => mediaPrincipal,
  revokeSession: async () => {},
};

function makeApp(permissions = mediaPrincipal.permissions, options: {
  storage?: MediaStorage;
  store?: MediaStore;
} = {}) {
  const principal = { ...mediaPrincipal, permissions };
  const store: MediaStore = options.store ?? {
    create: async (_actorId, _canManageContent, input) => ({
      id: "asset-id",
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      altText: input.altText ?? null,
      uploadedById: principal.id,
      contentId: input.contentId ?? null,
      createdAt: new Date("2026-11-02T00:00:00Z"),
    }),
    list: async () => ({ items: [], nextCursor: null }),
  };
  const app = createApp({
    checkDatabase: async () => true,
    siteName: "Test",
    corsOrigins: ["http://localhost:5173"],
    auth: {
      store: { ...authStore, findSession: async () => principal },
      sessionSecret,
      siteUrl: "http://localhost:5173",
      secureCookie: false,
    },
    mediaStore: store,
    mediaStorage: options.storage,
  });
  return app;
}

const sessionCookie = `nkp_session=${"d".repeat(64)}`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0ioAAAAASUVORK5CYII=",
  "base64",
);

describe("media upload routes", () => {
  it("requires the media upload permission and configured storage", async () => {
    const forbidden = await request(makeApp(["content:read"]))
      .post("/api/v1/media")
      .set("Cookie", sessionCookie)
      .attach("file", png, { filename: "image.png", contentType: "image/png" });
    expect(forbidden.status).toBe(403);

    const unavailable = await request(makeApp())
      .post("/api/v1/media")
      .set("Cookie", sessionCookie)
      .attach("file", png, { filename: "image.png", contentType: "image/png" });
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("validates file bytes and stores a private object with safe metadata", async () => {
    const putObject = vi.fn(async () => {});
    const create = vi.fn(async (_actorId, _canManage, input) => ({
      id: "asset-id",
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      altText: input.altText ?? null,
      uploadedById: "staff-user",
      contentId: input.contentId ?? null,
      createdAt: new Date("2026-11-02T00:00:00Z"),
    }));
    const app = makeApp(mediaPrincipal.permissions, {
      storage: { putObject, deleteObject: async () => {} },
      store: { create, list: async () => ({ items: [], nextCursor: null }) },
    });

    const uploaded = await request(app)
      .post("/api/v1/media")
      .set("Cookie", sessionCookie)
      .field("altText", "A sample")
      .attach("file", png, { filename: "..\\unsafe.png", contentType: "text/plain" });

    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.mimeType).toBe("image/png");
    expect(uploaded.body.data.originalName).toBe("unsafe.png");
    expect(uploaded.body.data.storageKey).toMatch(/^media\/[0-9a-f-]+\.png$/);
    expect(putObject).toHaveBeenCalledWith({
      key: uploaded.body.data.storageKey,
      body: png,
      contentType: "image/png",
    });
    expect(create).toHaveBeenCalledWith("staff-user", false, expect.objectContaining({
      originalName: "unsafe.png",
      mimeType: "image/png",
      altText: "A sample",
    }));
  });

  it("rejects unsupported content and removes objects when metadata persistence fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const deleteObject = vi.fn(async () => {});
    const storage = { putObject: async () => {}, deleteObject };
    const app = makeApp(mediaPrincipal.permissions, {
      storage,
      store: {
        create: async () => { throw new Error("database unavailable"); },
        list: async () => ({ items: [], nextCursor: null }),
      },
    });

    const unsupported = await request(app)
      .post("/api/v1/media")
      .set("Cookie", sessionCookie)
      .attach("file", Buffer.from("not an image"), { filename: "not-an-image.jpg", contentType: "image/jpeg" });
    expect(unsupported.status).toBe(415);

    const failed = await request(app)
      .post("/api/v1/media")
      .set("Cookie", sessionCookie)
      .attach("file", png, { filename: "image.png", contentType: "image/png" });
    expect(failed.status).toBe(500);
    expect(deleteObject).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });

  it("enforces the smaller image limit even when the multipart limit allows larger PDFs", async () => {
    const putObject = vi.fn(async () => {});
    const app = makeApp(mediaPrincipal.permissions, {
      storage: { putObject, deleteObject: async () => {} },
    });
    const oversizedImage = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024 - png.length + 1)]);

    const response = await request(app)
      .post("/api/v1/media")
      .set("Cookie", sessionCookie)
      .attach("file", oversizedImage, { filename: "large.png", contentType: "image/png" });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("FILE_TOO_LARGE");
    expect(putObject).not.toHaveBeenCalled();
  });

  it("returns metadata only and scopes listing to the uploader by default", async () => {
    const list = vi.fn(async () => ({ items: [], nextCursor: null }));
    const app = makeApp(mediaPrincipal.permissions, {
      storage: { putObject: async () => {}, deleteObject: async () => {} },
      store: { create: async () => null, list },
    });

    const response = await request(app)
      .get("/api/v1/media?limit=10")
      .set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(list).toHaveBeenCalledWith({
      actorId: "staff-user",
      viewAll: false,
      limit: 10,
    });
  });
});
