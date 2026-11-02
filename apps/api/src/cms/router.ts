import { Router } from "express";
import { z } from "zod";
import { fail, ok } from "../response.js";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import type { AuthOptions } from "../auth/router.js";
import {
  CmsConflictError,
  CmsProvenanceError,
  CmsStateError,
  type CmsStore,
} from "./types.js";

const languages = ["ne", "en"] as const;
const contentTypes = ["ARTICLE", "RESOURCE", "NOTICE", "EXPLAINER"] as const;
const contentStatuses = ["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
const rightsTypes = ["ORIGINAL", "THIRD_PARTY"] as const;
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const sourceUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
});
const nullableSourceUrl = sourceUrlSchema.nullable();
const translationSchema = z.object({
  language: z.enum(languages),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(500).nullable().optional(),
  body: z.string().trim().min(1).max(500_000),
  seoTitle: z.string().trim().max(200).nullable().optional(),
  seoDescription: z.string().trim().max(500).nullable().optional(),
});
const translationsSchema = z.array(translationSchema).min(1).max(2).refine(
  (translations) => new Set(translations.map(({ language }) => language)).size === translations.length,
  "Translations must use distinct languages.",
);
const createSchema = z.object({
  type: z.enum(contentTypes),
  slug: slugSchema,
  sourceUrl: nullableSourceUrl.optional(),
  rights: z.string().trim().max(2_000).nullable().optional(),
  rightsType: z.enum(rightsTypes).nullable().optional(),
  translations: translationsSchema,
});
const updateSchema = z.object({
  type: z.enum(contentTypes).optional(),
  slug: slugSchema.optional(),
  sourceUrl: nullableSourceUrl.optional(),
  rights: z.string().trim().max(2_000).nullable().optional(),
  rightsType: z.enum(rightsTypes).nullable().optional(),
  translations: translationsSchema.optional(),
}).refine((input) => Object.keys(input).length > 0, "Provide at least one field to update.");
const listSchema = z.object({
  status: z.enum(contentStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});
const returnSchema = z.object({ reason: z.string().trim().min(1).max(1_000) });

function validationFailure(res: Parameters<typeof fail>[0], error: z.ZodError) {
  return fail(res, 400, "VALIDATION_ERROR", "Check the submitted details.", error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  })));
}

function canManage(permissions: string[]): boolean {
  return permissions.includes("*") || permissions.includes("content:manage");
}

function canViewAll(permissions: string[]): boolean {
  return canManage(permissions) || permissions.includes("content:review") || permissions.includes("content:publish");
}

function handleCmsError(error: unknown, res: Parameters<typeof fail>[0]) {
  if (error instanceof CmsConflictError) return fail(res, 409, "CONTENT_CONFLICT", error.message);
  if (error instanceof CmsStateError) return fail(res, 409, "INVALID_CONTENT_STATE", error.message);
  if (error instanceof CmsProvenanceError) {
    return fail(res, 422, "PROVENANCE_REQUIRED", error.message, error.issues.map((message) => ({ message })));
  }
  return null;
}

export function cmsRouter(store: CmsStore, auth: AuthOptions) {
  const router = Router();
  const requireUser = requireAuth(auth.store, auth.sessionSecret, auth.secureCookie);

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/cms/content", requireUser, requirePermission("content:read"), async (req, res, next) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return validationFailure(res, parsed.error);
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const result = await store.list(principal.id, canViewAll(principal.permissions), parsed.data);
      return ok(res, result.items, { nextCursor: result.nextCursor });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/cms/content/:id", requireUser, requirePermission("content:read"), async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return fail(res, 400, "VALIDATION_ERROR", "Content id must be a UUID.");
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const content = await store.get(principal.id, canViewAll(principal.permissions), id.data);
      return content ? ok(res, content) : fail(res, 404, "NOT_FOUND", "Content not found.");
    } catch (error) {
      return next(error);
    }
  });

  router.post("/cms/content", requireUser, requirePermission("content:create"), async (req, res, next) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const content = await store.createDraft(principal.id, parsed.data);
      return ok(res, content, undefined, 201);
    } catch (error) {
      const handled = handleCmsError(error, res);
      return handled ?? next(error);
    }
  });

  router.patch("/cms/content/:id", requireUser, requirePermission("content:update"), async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return fail(res, 400, "VALIDATION_ERROR", "Content id must be a UUID.");
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const content = await store.updateDraft(
        principal.id,
        canManage(principal.permissions),
        id.data,
        parsed.data,
      );
      return content ? ok(res, content) : fail(res, 404, "NOT_FOUND", "Content not found.");
    } catch (error) {
      const handled = handleCmsError(error, res);
      return handled ?? next(error);
    }
  });

  router.post("/cms/content/:id/submit", requireUser, requirePermission("content:submit"), async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return fail(res, 400, "VALIDATION_ERROR", "Content id must be a UUID.");
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const content = await store.submitForReview(
        principal.id,
        canManage(principal.permissions) || principal.permissions.includes("content:review"),
        id.data,
      );
      return content ? ok(res, content) : fail(res, 404, "NOT_FOUND", "Content not found.");
    } catch (error) {
      const handled = handleCmsError(error, res);
      return handled ?? next(error);
    }
  });

  router.post("/cms/content/:id/publish", requireUser, requirePermission("content:publish"), async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return fail(res, 400, "VALIDATION_ERROR", "Content id must be a UUID.");
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const content = await store.publish(principal.id, id.data);
      return content ? ok(res, content) : fail(res, 404, "NOT_FOUND", "Content not found.");
    } catch (error) {
      const handled = handleCmsError(error, res);
      return handled ?? next(error);
    }
  });

  router.post("/cms/content/:id/return", requireUser, requirePermission("content:review"), async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return fail(res, 400, "VALIDATION_ERROR", "Content id must be a UUID.");
    const parsed = returnSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);
    const principal = req.auth;
    if (!principal) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    try {
      const content = await store.returnToDraft(principal.id, id.data, parsed.data.reason);
      return content ? ok(res, content) : fail(res, 404, "NOT_FOUND", "Content not found.");
    } catch (error) {
      const handled = handleCmsError(error, res);
      return handled ?? next(error);
    }
  });

  return router;
}
