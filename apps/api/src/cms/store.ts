import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../db.js";
import { provenanceIssues } from "./provenance.js";
import {
  CmsConflictError,
  CmsProvenanceError,
  CmsStateError,
  type CmsContent,
  type CmsListOptions,
  type CmsListResult,
  type CmsStore,
  type CreateDraftInput,
  type UpdateDraftInput,
} from "./types.js";

const contentInclude = { translations: { orderBy: { language: "asc" as const } } };

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function contentSnapshot(content: {
  type: string;
  slug: string;
  status: string;
  sourceUrl: string | null;
  rights: string | null;
  rightsType: string | null;
}) {
  return {
    type: content.type,
    slug: content.slug,
    status: content.status,
    sourceUrl: content.sourceUrl,
    rights: content.rights,
    rightsType: content.rightsType,
  };
}

export function createCmsStore(client?: PrismaClient): CmsStore {
  const db = async () => client ?? getPrisma();

  return {
    async list(actorId, viewAll, options): Promise<CmsListResult> {
      const prisma = await db();
      const records = await prisma.content.findMany({
        where: {
          ...(viewAll ? {} : { authorId: actorId }),
          ...(options.status ? { status: options.status } : {}),
        },
        include: contentInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: options.limit + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      });
      const hasMore = records.length > options.limit;
      const page = hasMore ? records.slice(0, options.limit) : records;
      return {
        items: page,
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      };
    },

    async get(actorId, viewAll, id): Promise<CmsContent | null> {
      const prisma = await db();
      const content = await prisma.content.findUnique({
        where: { id },
        include: contentInclude,
      });
      if (!content || (!viewAll && content.authorId !== actorId)) return null;
      return content;
    },

    async createDraft(actorId, input): Promise<CmsContent> {
      const prisma = await db();
      try {
        return await prisma.$transaction(async (tx) => {
          const content = await tx.content.create({
            data: {
              type: input.type,
              slug: input.slug,
              authorId: actorId,
              sourceUrl: input.sourceUrl,
              rights: input.rights,
              rightsType: input.rightsType,
              translations: { create: input.translations },
            },
            include: contentInclude,
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: "content.create",
              entityType: "content",
              entityId: content.id,
              afterData: contentSnapshot(content),
            },
          });
          return content;
        });
      } catch (error) {
        if (isPrismaCode(error, "P2002")) throw new CmsConflictError("A content item with this type and slug already exists.");
        throw error;
      }
    },

    async updateDraft(actorId, canManage, id, input): Promise<CmsContent | null> {
      const prisma = await db();
      try {
        return await prisma.$transaction(async (tx) => {
          const current = await tx.content.findUnique({ where: { id } });
          if (!current || (!canManage && current.authorId !== actorId)) return null;
          if (current.status !== "DRAFT") throw new CmsStateError("Only drafts can be edited.");

          const { translations, ...fields } = input;
          const update = await tx.content.updateMany({
            where: { id, status: "DRAFT" },
            data: { ...fields, updatedAt: new Date() },
          });
          if (update.count === 0) throw new CmsStateError("Content state changed; reload before editing.");

          if (translations !== undefined) {
            await tx.contentTranslation.deleteMany({ where: { contentId: id } });
            await tx.contentTranslation.createMany({
              data: translations.map((translation) => ({ ...translation, contentId: id })),
            });
          }
          const updated = await tx.content.findUnique({ where: { id }, include: contentInclude });
          if (!updated) throw new CmsStateError("Content no longer exists.");
          await tx.auditLog.create({
            data: {
              actorId,
              action: "content.update",
              entityType: "content",
              entityId: id,
              beforeData: contentSnapshot(current),
              afterData: contentSnapshot(updated),
            },
          });
          return updated;
        });
      } catch (error) {
        if (isPrismaCode(error, "P2002")) throw new CmsConflictError("A content item with this type and slug already exists.");
        throw error;
      }
    },

    async submitForReview(actorId, canManage, id): Promise<CmsContent | null> {
      const prisma = await db();
      return prisma.$transaction(async (tx) => {
        const content = await tx.content.findUnique({ where: { id }, include: contentInclude });
        if (!content || (!canManage && content.authorId !== actorId)) return null;
        if (content.status !== "DRAFT") throw new CmsStateError("Only drafts can be submitted for review.");

        const transition = await tx.content.updateMany({
          where: { id, status: "DRAFT" },
          data: { status: "REVIEW", updatedAt: new Date() },
        });
        if (transition.count === 0) throw new CmsStateError("Content state changed; reload before submitting.");
        const updated = await tx.content.findUnique({ where: { id }, include: contentInclude });
        if (!updated) throw new CmsStateError("Content no longer exists.");
        await tx.auditLog.create({
          data: {
            actorId,
            action: "content.submit_for_review",
            entityType: "content",
            entityId: id,
            beforeData: contentSnapshot(content),
            afterData: contentSnapshot(updated),
          },
        });
        return updated;
      });
    },

    async publish(actorId, id): Promise<CmsContent | null> {
      const prisma = await db();
      return prisma.$transaction(async (tx) => {
        const content = await tx.content.findUnique({ where: { id }, include: contentInclude });
        if (!content) return null;
        if (content.status !== "REVIEW") throw new CmsStateError("Only content in review can be published.");
        const issues = provenanceIssues(content);
        if (issues.length) throw new CmsProvenanceError(issues);

        const transition = await tx.content.updateMany({
          where: { id, status: "REVIEW" },
          data: { status: "PUBLISHED", publishedAt: new Date(), updatedAt: new Date() },
        });
        if (transition.count === 0) throw new CmsStateError("Content state changed; reload before publishing.");
        const updated = await tx.content.findUnique({ where: { id }, include: contentInclude });
        if (!updated) throw new CmsStateError("Content no longer exists.");
        await tx.auditLog.create({
          data: {
            actorId,
            action: "content.publish",
            entityType: "content",
            entityId: id,
            beforeData: contentSnapshot(content),
            afterData: contentSnapshot(updated),
          },
        });
        return updated;
      });
    },

    async returnToDraft(actorId, id, reason): Promise<CmsContent | null> {
      const prisma = await db();
      return prisma.$transaction(async (tx) => {
        const content = await tx.content.findUnique({ where: { id }, include: contentInclude });
        if (!content) return null;
        if (content.status !== "REVIEW") throw new CmsStateError("Only content in review can be returned to draft.");

        const transition = await tx.content.updateMany({
          where: { id, status: "REVIEW" },
          data: { status: "DRAFT", updatedAt: new Date() },
        });
        if (transition.count === 0) throw new CmsStateError("Content state changed; reload before returning it.");
        const updated = await tx.content.findUnique({ where: { id }, include: contentInclude });
        if (!updated) throw new CmsStateError("Content no longer exists.");
        await tx.auditLog.create({
          data: {
            actorId,
            action: "content.return_to_draft",
            entityType: "content",
            entityId: id,
            beforeData: contentSnapshot(content),
            afterData: { ...contentSnapshot(updated), reason },
          },
        });
        return updated;
      });
    },
  };
}
