import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../db.js";
import type { MediaListOptions, MediaListResult, MediaStore, MediaUploadInput } from "./types.js";

export function createMediaStore(client?: PrismaClient): MediaStore {
  const db = async () => client ?? getPrisma();

  return {
    async create(actorId, canManageContent, input) {
      const prisma = await db();
      return prisma.$transaction(async (tx) => {
        if (input.contentId) {
          const content = await tx.content.findUnique({
            where: { id: input.contentId },
            select: { id: true, authorId: true, status: true },
          });
          if (
            !content ||
            content.status !== "DRAFT" ||
            (!canManageContent && content.authorId !== actorId)
          ) {
            return null;
          }
        }

        const asset = await tx.mediaAsset.create({
          data: {
            storageKey: input.storageKey,
            originalName: input.originalName,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            altText: input.altText,
            uploadedById: actorId,
            contentId: input.contentId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "media.upload",
            entityType: "media_asset",
            entityId: asset.id,
            afterData: {
              contentId: asset.contentId,
              mimeType: asset.mimeType,
              sizeBytes: asset.sizeBytes,
            },
          },
        });
        return asset;
      });
    },

    async list(options: MediaListOptions): Promise<MediaListResult> {
      const prisma = await db();
      const assets = await prisma.mediaAsset.findMany({
        where: {
          ...(options.viewAll ? {} : { uploadedById: options.actorId }),
          ...(options.contentId ? { contentId: options.contentId } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: options.limit + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      });
      const hasMore = assets.length > options.limit;
      const page = hasMore ? assets.slice(0, options.limit) : assets;
      return {
        items: page,
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      };
    },
  };
}
