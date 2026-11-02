import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lang } from "./i18n";

type ContentStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";
type ContentType = "ARTICLE" | "RESOURCE" | "NOTICE" | "EXPLAINER";
type RightsType = "ORIGINAL" | "THIRD_PARTY";
type Language = "ne" | "en";

interface Translation {
  language: Language;
  title: string;
  summary?: string | null;
  body: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

interface ContentItem {
  id: string;
  type: ContentType;
  slug: string;
  status: ContentStatus;
  authorId: string;
  sourceUrl: string | null;
  rights: string | null;
  rightsType: RightsType | null;
  publishedAt: string | null;
  updatedAt: string;
  translations: Translation[];
}

interface MediaAsset {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: { nextCursor?: string | null };
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ message?: string }>;
  };
}

interface CmsCopy {
  title: string;
  description: string;
  signIn: string;
  noPermission: string;
  loading: string;
  loadFailed: string;
  retry: string;
  newDraft: string;
  contentList: string;
  allStatuses: string;
  type: string;
  slug: string;
  translation: string;
  nepali: string;
  english: string;
  translationTitle: string;
  summary: string;
  body: string;
  provenance: string;
  rightsType: string;
  original: string;
  thirdParty: string;
  sourceUrl: string;
  rights: string;
  saveDraft: string;
  createDraft: string;
  submitReview: string;
  publish: string;
  returnToDraft: string;
  returnReason: string;
  status: string;
  updated: string;
  media: string;
  uploadFile: string;
  altText: string;
  attachUpload: string;
  storageUnavailable: string;
  noMedia: string;
  noContent: string;
  saved: string;
  actionFailed: string;
  saving: string;
  uploading: string;
  chooseContent: string;
  unsupportedStatus: string;
}

const copy: Record<Lang, CmsCopy> = {
  en: {
    title: "Content workspace",
    description: "Create bilingual drafts, send them for review, and publish reviewed content.",
    signIn: "Sign in to use the content workspace.",
    noPermission: "Your account does not have permission to read CMS content.",
    loading: "Loading content…",
    loadFailed: "Could not load content.",
    retry: "Try again",
    newDraft: "New draft",
    contentList: "Content",
    allStatuses: "All statuses",
    type: "Content type",
    slug: "URL slug",
    translation: "Translations",
    nepali: "Nepali",
    english: "English",
    translationTitle: "Title",
    summary: "Summary",
    body: "Body",
    provenance: "Source and rights",
    rightsType: "Material type",
    original: "Original (owned by platform/author)",
    thirdParty: "Third-party material",
    sourceUrl: "Source URL",
    rights: "Rights / license / attribution",
    saveDraft: "Save draft",
    createDraft: "Create draft",
    submitReview: "Submit for review",
    publish: "Publish",
    returnToDraft: "Return to draft",
    returnReason: "Reason for returning this item",
    status: "Status",
    updated: "Updated",
    media: "Attachments",
    uploadFile: "File",
    altText: "Alternative text (optional)",
    attachUpload: "Upload to this draft",
    storageUnavailable: "Media storage is not configured. Uploads are unavailable.",
    noMedia: "No attachments are recorded for this draft.",
    noContent: "No content found for this filter.",
    saved: "Changes saved.",
    actionFailed: "The request could not be completed.",
    saving: "Saving…",
    uploading: "Uploading…",
    chooseContent: "Choose an item from the list to edit.",
    unsupportedStatus: "This status has no editing workflow action.",
  },
  ne: {
    title: "सामग्री कार्यक्षेत्र",
    description: "द्विभाषिक मस्यौदा बनाउनुहोस्, समीक्षाका लागि पठाउनुहोस् र समीक्षा भएको सामग्री प्रकाशित गर्नुहोस्।",
    signIn: "सामग्री कार्यक्षेत्र प्रयोग गर्न लगइन गर्नुहोस्।",
    noPermission: "तपाईंको खातासँग CMS सामग्री हेर्ने अनुमति छैन।",
    loading: "सामग्री लोड हुँदैछ…",
    loadFailed: "सामग्री लोड गर्न सकिएन।",
    retry: "फेरि प्रयास गर्नुहोस्",
    newDraft: "नयाँ मस्यौदा",
    contentList: "सामग्री",
    allStatuses: "सबै अवस्था",
    type: "सामग्रीको प्रकार",
    slug: "URL स्लग",
    translation: "अनुवाद",
    nepali: "नेपाली",
    english: "अङ्ग्रेजी",
    translationTitle: "शीर्षक",
    summary: "सारांश",
    body: "मुख्य सामग्री",
    provenance: "स्रोत र अधिकार",
    rightsType: "सामग्रीको प्रकार",
    original: "मौलिक (मञ्च/लेखकको स्वामित्व)",
    thirdParty: "तेस्रो पक्षको सामग्री",
    sourceUrl: "स्रोत URL",
    rights: "अधिकार / इजाजत / श्रेय",
    saveDraft: "मस्यौदा सुरक्षित गर्नुहोस्",
    createDraft: "मस्यौदा बनाउनुहोस्",
    submitReview: "समीक्षाका लागि पठाउनुहोस्",
    publish: "प्रकाशित गर्नुहोस्",
    returnToDraft: "मस्यौदामा फर्काउनुहोस्",
    returnReason: "फिर्ता गर्नुको कारण",
    status: "अवस्था",
    updated: "अन्तिम अद्यावधिक",
    media: "संलग्न फाइल",
    uploadFile: "फाइल",
    altText: "वैकल्पिक पाठ (ऐच्छिक)",
    attachUpload: "यस मस्यौदामा अपलोड गर्नुहोस्",
    storageUnavailable: "मिडिया भण्डारण सेट गरिएको छैन। अपलोड उपलब्ध छैन।",
    noMedia: "यस मस्यौदामा कुनै संलग्न फाइल छैन।",
    noContent: "यस छनोटमा सामग्री भेटिएन।",
    saved: "परिवर्तन सुरक्षित भयो।",
    actionFailed: "अनुरोध पूरा गर्न सकिएन।",
    saving: "सुरक्षित हुँदैछ…",
    uploading: "अपलोड हुँदैछ…",
    chooseContent: "सम्पादन गर्न सूचीबाट सामग्री छान्नुहोस्।",
    unsupportedStatus: "यो अवस्थाका लागि सम्पादन प्रक्रिया उपलब्ध छैन।",
  },
};

const statusNames: Record<Lang, Record<ContentStatus, string>> = {
  en: { DRAFT: "Draft", REVIEW: "In review", PUBLISHED: "Published", SCHEDULED: "Scheduled", ARCHIVED: "Archived" },
  ne: { DRAFT: "मस्यौदा", REVIEW: "समीक्षामा", PUBLISHED: "प्रकाशित", SCHEDULED: "निर्धारित", ARCHIVED: "अभिलेख" },
};

const typeNames: Record<Lang, Record<ContentType, string>> = {
  en: { ARTICLE: "Article", RESOURCE: "Resource", NOTICE: "Notice", EXPLAINER: "Explainer" },
  ne: { ARTICLE: "लेख", RESOURCE: "स्रोत सामग्री", NOTICE: "सूचना", EXPLAINER: "व्याख्या" },
};

const emptyTranslation = (): Translation => ({ language: "ne", title: "", summary: "", body: "" });

async function requestApi<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(url, { credentials: "include", ...init });
  let body: ApiResponse<T>;
  try {
    body = await response.json() as ApiResponse<T>;
  } catch {
    throw new Error(response.ok ? "Invalid API response." : `Request failed (${response.status}).`);
  }
  if (!response.ok || !body.success) {
    const details = body.error?.details?.map(({ message }) => message).filter(Boolean).join(" ");
    throw new Error([body.error?.message, details].filter(Boolean).join(" ") || `Request failed (${response.status}).`);
  }
  return body;
}

function contentPayload(item: ContentItem) {
  return {
    type: item.type,
    slug: item.slug,
    sourceUrl: item.sourceUrl || null,
    rights: item.rights || null,
    rightsType: item.rightsType,
    translations: item.translations
      .filter((translation) => translation.title.trim() && translation.body.trim())
      .map((translation) => ({
        ...translation,
        title: translation.title.trim(),
        body: translation.body.trim(),
        summary: translation.summary?.trim() || null,
      })),
  };
}

function humanError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function CmsPage({ lang, permissions }: { lang: Lang; permissions: string[] }) {
  const t = copy[lang];
  const queryClient = useQueryClient();
  const canRead = permissions.includes("*") || permissions.includes("content:read");
  const canCreate = permissions.includes("*") || permissions.includes("content:create");
  const canUpdate = permissions.includes("*") || permissions.includes("content:update");
  const canSubmit = permissions.includes("*") || permissions.includes("content:submit");
  const canPublish = permissions.includes("*") || permissions.includes("content:publish");
  const canReview = permissions.includes("*") || permissions.includes("content:review");
  const canUpload = permissions.includes("*") || permissions.includes("media:upload");
  const canReadMedia = permissions.includes("*") || permissions.includes("media:read");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ContentItem | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const contentQuery = useQuery({
    queryKey: ["cms", "content", statusFilter],
    enabled: canRead,
    queryFn: async () => {
      const query = new URLSearchParams({ limit: "50" });
      if (statusFilter) query.set("status", statusFilter);
      const body = await requestApi<ContentItem[]>(`/api/v1/cms/content?${query}`);
      return body.data ?? [];
    },
    retry: false,
  });

  const selectedFromList = useMemo(
    () => contentQuery.data?.find((item) => item.id === selectedId) ?? null,
    [contentQuery.data, selectedId],
  );

  useEffect(() => {
    if (selectedFromList && selectedFromList.status !== "DRAFT") setEditor(selectedFromList);
  }, [selectedFromList]);

  const mediaQuery = useQuery({
    queryKey: ["cms", "media", editor?.id],
    enabled: Boolean(editor?.id && canReadMedia),
    queryFn: async () => {
      const query = new URLSearchParams({ contentId: editor!.id, limit: "50" });
      const body = await requestApi<MediaAsset[]>(`/api/v1/media?${query}`);
      return body.data ?? [];
    },
    retry: false,
  });

  function startNewDraft() {
    setSelectedId(null);
    setEditor({
      id: "",
      type: "ARTICLE",
      slug: "",
      status: "DRAFT",
      authorId: "",
      sourceUrl: null,
      rights: null,
      rightsType: null,
      publishedAt: null,
      updatedAt: new Date().toISOString(),
      translations: [emptyTranslation()],
    });
    setMessage("");
    setError("");
  }

  function selectContent(item: ContentItem) {
    setSelectedId(item.id);
    setEditor(item.status === "DRAFT" && !canUpdate ? item : structuredClone(item));
    setReturnReason("");
    setSelectedFile(null);
    setMessage("");
    setError("");
  }

  function updateTranslation(language: Language, field: keyof Omit<Translation, "language">, value: string) {
    setEditor((current) => {
      if (!current) return current;
      const translation = current.translations.find((entry) => entry.language === language);
      const next = translation
        ? current.translations.map((entry) => entry.language === language ? { ...entry, [field]: value } : entry)
        : [...current.translations, { ...emptyTranslation(), language, [field]: value }];
      return { ...current, translations: next };
    });
  }

  async function saveDraft(event?: FormEvent<HTMLFormElement>): Promise<boolean> {
    event?.preventDefault();
    if (!editor) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = contentPayload(editor);
      if (!payload.translations.length) throw new Error(t.translationTitle);
      const isNew = !editor.id;
      if (isNew && !canCreate) throw new Error(t.noPermission);
      if (!isNew && !canUpdate) throw new Error(t.noPermission);
      const body = await requestApi<ContentItem>(
        isNew ? "/api/v1/cms/content" : `/api/v1/cms/content/${editor.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!body.data) throw new Error(t.actionFailed);
      setEditor(body.data);
      setSelectedId(body.data.id);
      await queryClient.invalidateQueries({ queryKey: ["cms", "content"] });
      setMessage(t.saved);
      return true;
    } catch (saveError) {
      setError(humanError(saveError, t.actionFailed));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "submit" | "publish" | "return") {
    if (!editor?.id) return;
    if (editor.status === "DRAFT" && canUpdate) {
      if (!await saveDraft()) return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await requestApi<ContentItem>(`/api/v1/cms/content/${editor.id}/${action}`, {
        method: "POST",
        headers: action === "return" ? { "Content-Type": "application/json" } : undefined,
        ...(action === "return" ? { body: JSON.stringify({ reason: returnReason }) } : {}),
      });
      if (!body.data) throw new Error(t.actionFailed);
      setEditor(body.data);
      await queryClient.invalidateQueries({ queryKey: ["cms", "content"] });
      setMessage(t.saved);
    } catch (actionError) {
      setError(humanError(actionError, t.actionFailed));
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor?.id || !selectedFile) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData();
    form.set("file", selectedFile);
    form.set("contentId", editor.id);
    if (altText.trim()) form.set("altText", altText.trim());
    try {
      await requestApi<MediaAsset>("/api/v1/media", { method: "POST", body: form });
      setSelectedFile(null);
      setAltText("");
      await queryClient.invalidateQueries({ queryKey: ["cms", "media", editor.id] });
      setMessage(t.saved);
    } catch (uploadError) {
      setError(humanError(uploadError, t.actionFailed));
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  const editorEditable = editor?.status === "DRAFT" && (editor.id ? canUpdate : canCreate);

  if (!canRead) {
    return (
      <section className="cms-page">
        <h1>{t.title}</h1>
        <p role="alert">{t.noPermission}</p>
        <a href={`/${lang}/login`}>{t.signIn}</a>
      </section>
    );
  }

  return (
    <section className="cms-page">
      <div className="cms-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
        </div>
        {canCreate && <button className="primary-button" type="button" onClick={startNewDraft}>{t.newDraft}</button>}
      </div>
      {message && <p className="cms-success" role="status">{message}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}

      <div className="cms-layout">
        <aside className="cms-sidebar" aria-label={t.contentList}>
          <h2>{t.contentList}</h2>
          <label>
            {t.status}
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">{t.allStatuses}</option>
              {(Object.keys(statusNames.en) as ContentStatus[]).map((status) => (
                <option key={status} value={status}>{statusNames[lang][status]}</option>
              ))}
            </select>
          </label>
          {contentQuery.isLoading && <p>{t.loading}</p>}
          {contentQuery.isError && <p role="alert">{t.loadFailed} <button type="button" className="text-button" onClick={() => void contentQuery.refetch()}>{t.retry}</button></p>}
          {contentQuery.data?.length === 0 && <p>{t.noContent}</p>}
          <ul className="cms-list">
            {contentQuery.data?.map((item) => {
              const label = item.translations[0]?.title || item.slug;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="cms-list-item"
                    aria-current={selectedId === item.id ? "true" : undefined}
                    onClick={() => selectContent(item)}
                  >
                    <strong>{label}</strong>
                    <span>{statusNames[lang][item.status]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="cms-editor">
          {!editor ? <p>{t.chooseContent}</p> : (
            <form onSubmit={(event) => { void saveDraft(event); }}>
              <div className="cms-editor-heading">
                <h2>{editor.id ? (editor.translations[0]?.title || editor.slug) : t.newDraft}</h2>
                {editor.id && <span className="cms-status">{statusNames[lang][editor.status]}</span>}
              </div>

              <div className="cms-field-grid">
                <label>
                  {t.type}
                  <select
                    value={editor.type}
                    disabled={!editorEditable}
                    onChange={(event) => setEditor({ ...editor, type: event.target.value as ContentType })}
                  >
                    {(Object.keys(typeNames.en) as ContentType[]).map((type) => (
                      <option key={type} value={type}>{typeNames[lang][type]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.slug}
                  <input
                    required
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    maxLength={160}
                    disabled={!editorEditable}
                    value={editor.slug}
                    onChange={(event) => setEditor({ ...editor, slug: event.target.value })}
                  />
                </label>
              </div>

              <fieldset className="cms-provenance">
                <legend>{t.provenance}</legend>
                <label>
                  {t.rightsType}
                  <select
                    value={editor.rightsType ?? ""}
                    disabled={!editorEditable}
                    onChange={(event) => setEditor({
                      ...editor,
                      rightsType: (event.target.value || null) as RightsType | null,
                    })}
                  >
                    <option value="">—</option>
                    <option value="ORIGINAL">{t.original}</option>
                    <option value="THIRD_PARTY">{t.thirdParty}</option>
                  </select>
                </label>
                {editor.rightsType === "THIRD_PARTY" && (
                  <>
                    <label>
                      {t.sourceUrl}
                      <input
                        type="url"
                        disabled={!editorEditable}
                        value={editor.sourceUrl ?? ""}
                        onChange={(event) => setEditor({ ...editor, sourceUrl: event.target.value || null })}
                      />
                    </label>
                    <label>
                      {t.rights}
                      <textarea
                        rows={3}
                        maxLength={2000}
                        disabled={!editorEditable}
                        value={editor.rights ?? ""}
                        onChange={(event) => setEditor({ ...editor, rights: event.target.value || null })}
                      />
                    </label>
                  </>
                )}
              </fieldset>

              <fieldset className="cms-translations">
                <legend>{t.translation}</legend>
                {(["ne", "en"] as Language[]).map((language) => {
                  const translation = editor.translations.find((entry) => entry.language === language);
                  return (
                    <details key={language} open={Boolean(translation)} className="cms-language">
                      <summary>{language === "ne" ? t.nepali : t.english}</summary>
                      <label>
                        {t.translationTitle}
                        <input
                          maxLength={200}
                          disabled={!editorEditable}
                          value={translation?.title ?? ""}
                          onChange={(event) => updateTranslation(language, "title", event.target.value)}
                        />
                      </label>
                      <label>
                        {t.summary}
                        <textarea
                          rows={2}
                          maxLength={500}
                          disabled={!editorEditable}
                          value={translation?.summary ?? ""}
                          onChange={(event) => updateTranslation(language, "summary", event.target.value)}
                        />
                      </label>
                      <label>
                        {t.body}
                        <textarea
                          rows={10}
                          maxLength={500_000}
                          disabled={!editorEditable}
                          value={translation?.body ?? ""}
                          onChange={(event) => updateTranslation(language, "body", event.target.value)}
                        />
                      </label>
                    </details>
                  );
                })}
              </fieldset>

              <div className="cms-actions">
                {editor.status === "DRAFT" && (editor.id ? canUpdate : canCreate) && (
                  <button className="primary-button" type="submit" disabled={busy}>
                    {busy ? t.saving : editor.id ? t.saveDraft : t.createDraft}
                  </button>
                )}
                {editor.status === "DRAFT" && editor.id && canSubmit && (
                  <button type="button" disabled={busy} onClick={() => void transition("submit")}>{t.submitReview}</button>
                )}
                {editor.status === "REVIEW" && canPublish && (
                  <button className="primary-button" type="button" disabled={busy} onClick={() => void transition("publish")}>{t.publish}</button>
                )}
                {editor.status === "REVIEW" && canReview && (
                  <>
                    <label className="cms-return-reason">
                      {t.returnReason}
                      <input required maxLength={1000} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} />
                    </label>
                    <button type="button" disabled={busy || !returnReason.trim()} onClick={() => void transition("return")}>{t.returnToDraft}</button>
                  </>
                )}
                {!["DRAFT", "REVIEW"].includes(editor.status) && <span>{t.unsupportedStatus}</span>}
              </div>
            </form>
          )}

          {editor?.id && editor.status === "DRAFT" && (
            <section className="cms-media">
              <h2>{t.media}</h2>
              {canReadMedia && (
                <>
                  {mediaQuery.isError && <p className="auth-error" role="alert">{humanError(mediaQuery.error, t.loadFailed)}</p>}
                  {!mediaQuery.isLoading && mediaQuery.data?.length === 0 && <p>{t.noMedia}</p>}
                  <ul className="media-list">
                    {mediaQuery.data?.map((asset) => (
                      <li key={asset.id}>
                        <strong>{asset.originalName}</strong>
                        <span>{asset.mimeType} · {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MiB</span>
                        {asset.altText && <span>{asset.altText}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {canUpload && (
                <form className="media-upload-form" onSubmit={uploadMedia}>
                  <label>
                    {t.uploadFile}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      required
                      onChange={onFileChange}
                    />
                    <small>JPEG, PNG, WebP ≤ 10 MiB · PDF ≤ 25 MiB</small>
                  </label>
                  <label>
                    {t.altText}
                    <input maxLength={250} value={altText} onChange={(event) => setAltText(event.target.value)} />
                  </label>
                  <button type="submit" disabled={busy || !selectedFile}>
                    {busy ? t.uploading : t.attachUpload}
                  </button>
                </form>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
