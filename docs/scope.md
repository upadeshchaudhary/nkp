# Scope

Launch: Education Hub, Youth News, Games and Puzzles, AI Newsroom (internal), shared CMS, RBAC, bilingual pages, basic analytics, backups.

Later: native apps, community features, ad serving, paid courses, autonomous publishing, personalization.

Current state: Phase 3 foundation implemented (email/password and Google sign-in, server-side sessions, RBAC primitives, and authentication audit events). Phase 4 scope is agreed: shared bilingual CMS, Cloudflare R2 media storage, staff-only uploads (JPEG/PNG/WebP up to 10 MiB; PDF up to 25 MiB), and a provenance requirement before publishing third-party content. Phase 4 is in progress: authenticated CMS workflow, bilingual editor/review UI, and private R2 media upload APIs are implemented with audit events and a provenance gate. Public delivery of published assets remains. The additive migrations are not applied; database state is unknown.
