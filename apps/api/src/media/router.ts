import { randomUUID } from "node:crypto";
import path from "node:path";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { Router, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { fail, ok } from "../response.js";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import type { AuthOptions } from "../auth/router.js";
import {
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  type AllowedMediaType,
  type MediaStorage,
  type MediaStore,
} from "./types.js";

const listSchema = z.object({
  contentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});
const altTextSchema = z.string().trim().max(250).optional();
const extensionByMime: Record<AllowedMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const imageTypes = new Set<AllowedMediaType>(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2, parts: 3 },
});
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => fail(res, 429, "RATE_LIMITED", "Too many uploads. Try again later."),
});

function validationFailure(res: Parameters<typeof fail>[0], error: z.ZodError) {
  return fail(res, 400, "VALIDATION_ERROR", "Check the submitted details.", error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  })));
}

function isAllowedMediaType(mime: string): mime is AllowedMediaType {
  return Object.prototype.hasOwnProperty.call(extensionByMime, mime);
}

function uploadParser(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return fail(res, 413, "FILE_TOO_LARGE", "The file exceeds the 25 MiB upload limit.");
      }
      return fail(res, 400, "INVALID_UPLOAD", "Upload exactly one file using the 'file' field.");
    }
    return next(error);
  });
}

function safeOriginalName(originalName: string, extension: string): string {
  const basename = path.posix.basename(originalName.replace(/\\/g, "/"));
  const safe = basename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .trim()
    .slice(0, 240);
  return safe || `upload.${extension}`;
}

export function mediaRouter(store: MediaStore, storage: MediaStorage | undefined, auth: AuthOptions) {
  const router = Router();
  const requireUser = requireAuth(auth.store, auth.sessionSecret, auth.secureCookie);
  const mediaStorage = storage;
  const requireStorage = (_req: Request, res: Response, next: NextFunction) => {
    if (!mediaStorage) return fail(res, 503, "STORAGE_UNAVAILABLE", "Media storage is not configured.");
    return next();
  };

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/media", requireUser, requirePermission("media:read"), async (req, res, next) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return validationFailure(res, parsed.error);
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const viewAll = principal.permissions.includes("*") || principal.permissions.includes("media:manage");
      const result = await store.list({ ...parsed.data, actorId: principal.id, viewAll });
      return ok(res, result.items, { nextCursor: result.nextCursor });
    } catch (error) {
      return next(error);
    }
  });

  router.post(
    "/media",
    requireUser,
    requirePermission("media:upload"),
    uploadRateLimit,
    requireStorage,
    uploadParser,
    async (req, res, next) => {
      if (!mediaStorage) return fail(res, 503, "STORAGE_UNAVAILABLE", "Media storage is not configured.");
      const file = req.file;
      if (!file) return fail(res, 400, "FILE_REQUIRED", "Upload one file using the 'file' field.");

      let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
      try {
        detected = await fileTypeFromBuffer(file.buffer);
      } catch (error) {
        return next(error);
      }
      if (!detected || !isAllowedMediaType(detected.mime)) {
        return fail(res, 415, "UNSUPPORTED_FILE_TYPE", "Only JPEG, PNG, WebP images and PDF documents are accepted.");
      }
      const mimeType = detected.mime;
      if (imageTypes.has(mimeType) && file.size > MAX_IMAGE_BYTES) {
        return fail(res, 413, "FILE_TOO_LARGE", "Images must be 10 MiB or smaller.");
      }

      const altText = altTextSchema.safeParse(req.body?.altText);
      if (!altText.success) return validationFailure(res, altText.error);
      const contentId = req.body?.contentId;
      if (contentId !== undefined && !z.string().uuid().safeParse(contentId).success) {
        return fail(res, 400, "VALIDATION_ERROR", "contentId must be a UUID.");
      }

      const principal = req.auth;
      if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
      const canManageContent = principal.permissions.includes("*") ||
        principal.permissions.includes("content:manage");
      const extension = extensionByMime[mimeType];
      const storageKey = `media/${randomUUID()}.${extension}`;

      try {
        await mediaStorage.putObject({ key: storageKey, body: file.buffer, contentType: mimeType });
      } catch (error) {
        return next(error);
      }

      let asset;
      try {
        asset = await store.create(principal.id, canManageContent, {
          storageKey,
          originalName: safeOriginalName(file.originalname, extension),
          mimeType,
          sizeBytes: file.size,
          ...(altText.data ? { altText: altText.data } : {}),
          ...(contentId ? { contentId } : {}),
        });
      } catch (error) {
        try {
          await mediaStorage.deleteObject(storageKey);
        } catch (cleanupError) {
          console.error("Failed to remove an untracked media upload.", { storageKey, cleanupError });
          return next(new AggregateError([error, cleanupError], "Media upload failed and object cleanup also failed."));
        }
        return next(error);
      }
      if (!asset) {
        try {
          await mediaStorage.deleteObject(storageKey);
        } catch (cleanupError) {
          console.error("Failed to remove an untracked media upload.", { storageKey, cleanupError });
          return next(cleanupError);
        }
        return fail(res, 404, "CONTENT_NOT_FOUND", "The content item does not exist, is not a draft, or is not yours to edit.");
      }
      return ok(res, asset, undefined, 201);
    },
  );

  return router;
}
