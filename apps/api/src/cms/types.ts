import type { ContentRightsType, ContentStatus, ContentType, Language } from "@prisma/client";

export interface CmsTranslationInput {
  language: Language;
  title: string;
  summary?: string | null;
  body: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface CreateDraftInput {
  type: ContentType;
  slug: string;
  sourceUrl?: string | null;
  rights?: string | null;
  rightsType?: ContentRightsType | null;
  translations: CmsTranslationInput[];
}

export interface UpdateDraftInput {
  type?: ContentType;
  slug?: string;
  sourceUrl?: string | null;
  rights?: string | null;
  rightsType?: ContentRightsType | null;
  translations?: CmsTranslationInput[];
}

export interface CmsContent {
  id: string;
  type: ContentType;
  slug: string;
  status: ContentStatus;
  authorId: string;
  sourceUrl: string | null;
  rights: string | null;
  rightsType: ContentRightsType | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  translations: CmsTranslationInput[];
}

export interface CmsListOptions {
  status?: ContentStatus;
  limit: number;
  cursor?: string;
}

export interface CmsListResult {
  items: CmsContent[];
  nextCursor: string | null;
}

export interface CmsStore {
  list(actorId: string, viewAll: boolean, options: CmsListOptions): Promise<CmsListResult>;
  get(actorId: string, viewAll: boolean, id: string): Promise<CmsContent | null>;
  createDraft(actorId: string, input: CreateDraftInput): Promise<CmsContent>;
  updateDraft(actorId: string, canManage: boolean, id: string, input: UpdateDraftInput): Promise<CmsContent | null>;
  submitForReview(actorId: string, canManage: boolean, id: string): Promise<CmsContent | null>;
  publish(actorId: string, id: string): Promise<CmsContent | null>;
  returnToDraft(actorId: string, id: string, reason: string): Promise<CmsContent | null>;
}

export class CmsConflictError extends Error {}
export class CmsStateError extends Error {}
export class CmsProvenanceError extends Error {
  constructor(public readonly issues: string[]) {
    super("Content provenance is incomplete.");
  }
}
