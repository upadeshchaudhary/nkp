# Architecture decisions

Baseline from the project blueprint v1.0 (2 November 2026).

## ADR-001 Modular monolith plus separate AI service
Node/Express API owns auth, CMS, education, news and games. Python FastAPI runs AI work. Rationale: one developer, low budget.

## ADR-002 Brand is configuration
Site name and URL come from `PUBLIC_SITE_NAME` and `PUBLIC_SITE_URL` (later `system_settings`). Nothing brand-specific is hard-coded in logic.

## ADR-003 Language routing
Routes are `/ne/...` and `/en/...`. Root redirects to `/ne`. Translated content links to one canonical `content` row via `content_translations(content_id, language)`.

## ADR-004 Translation strategy
Confirmed for Phase 4: shared CMS uses a translations table keyed by (content_id, language). Education and news tables follow the same pattern.

## ADR-005 Sessions and authentication
Server-side session rows store HMAC-SHA-256 hashes of cryptographically random tokens; the browser receives only an HTTP-only, same-site cookie. Passwords use Argon2id. Google sign-in uses a server-side OAuth authorization-code flow, validates verified Google email identities, and links identities by immutable Google subject. Implemented in the Phase 3 foundation.

## ADR-006 Human approval gate
No AI path may publish. Publishing requires an authorized editor action recorded in `audit_logs`.

## ADR-007 First administrator bootstrap
The first administrator is provisioned only when a Google-verified identity exactly matches `BOOTSTRAP_ADMIN_EMAIL` and no administrator role assignment exists. That account receives the `admin` role and `*` permission in the same transaction as the user and audit event. Other first-time sign-ins receive only the `member` role.

## ADR-008 Phase 4 scope
Phase 4 delivers the shared bilingual CMS and media storage using Cloudflare R2. The CMS covers content authoring, review, and publishing; media uploads integrate with that content workflow.

## ADR-009 Media upload policy
Uploads are staff-only. Accept JPEG, PNG, WebP (up to 10 MiB) and PDF (up to 25 MiB). Validate file content, not only the client-provided MIME type, and keep storage private unless a specific asset is published for public delivery.

## ADR-010 Content provenance gate
Before publishing third-party content, editors must record its source/attribution and rights or license information. Original material can be marked as owned by the platform or author. This is an editorial metadata requirement, not a legal determination.

## ADR-011 Private media storage
Phase 4 uploads are staff-only and stored in a private Cloudflare R2 bucket using the S3-compatible API. The API validates file signatures, stores opaque object keys and metadata, and does not issue public URLs. Public asset delivery requires an explicit future design and must not expose unpublished files.

## Open items
Final name and domain, VPS and email provider, AI providers, source list, content rights, legal policies.
