import type { PrismaClient } from "@prisma/client";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_PDF_BYTES;

export type AllowedMediaType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export interface MediaUploadInput {
  storageKey: string;
  originalName: string;
  mimeType: AllowedMediaType;
  sizeBytes: number;
  altText?: string;
  contentId?: string;
}

export interface MediaAssetRecord {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  uploadedById: string;
  contentId: string | null;
  createdAt: Date;
}

export interface MediaListOptions {
  actorId: string;
  viewAll: boolean;
  contentId?: string;
  limit: number;
  cursor?: string;
}

export interface MediaListResult {
  items: MediaAssetRecord[];
  nextCursor: string | null;
}

export interface MediaStore {
  create(actorId: string, canManageContent: boolean, input: MediaUploadInput): Promise<MediaAssetRecord | null>;
  list(options: MediaListOptions): Promise<MediaListResult>;
}

export interface MediaStorage {
  putObject(input: {
    key: string;
    body: Buffer;
    contentType: AllowedMediaType;
  }): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export type MediaPrismaClient = PrismaClient;
