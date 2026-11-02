# Nepali Knowledge Platform

Monorepo for the platform described in the project blueprint. See `docs/`.

## Run locally
```
Copy-Item .env.example .env
docker compose up -d postgres redis
npm install
npm run db:generate
npm run db:migrate
npm run dev:api        # http://localhost:4000/api/v1/health
npm run dev:web        # http://localhost:5173
npm test
```
AI service: `docker compose up ai-service` (needs `AI_SERVICE_TOKEN`).

The checked-in initial migration is for an empty database. Before applying it to an existing Phase 2 database without matching tracked migration history, back up the database and baseline its migration state; do not accept a Prisma reset prompt.

## Status
Phase 3 foundation: email/password and Google sign-in, server-side sessions, RBAC primitives, and authentication audit events. Phase 4 is in progress: bilingual CMS editor/review UI, authenticated CMS workflow, and private R2 media upload APIs are implemented; public delivery of published assets remains. See `docs/decisions.md`.

CMS endpoints under `/api/v1/cms/content` require their matching `content:*` permissions (the bootstrap admin has `*`). Available operations: list/read, create draft, update draft, submit for review, publish reviewed content, and return reviewed content to draft. Publishing third-party content requires a source URL and rights/license details; original content must be classified as `ORIGINAL`.

### Media uploads

Set all four `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` values to enable the R2 upload endpoint. Keep the bucket private and use credentials scoped to this bucket. Uploads require `media:upload`; list access requires `media:read`. The multipart endpoint is `POST /api/v1/media`, with a `file` field and optional `altText` and draft `contentId` fields. The API accepts JPEG, PNG, and WebP images up to 10 MiB and PDF files up to 25 MiB. File signatures are checked server-side; uploaded objects remain private and the API does not expose a public URL. Uploads are rate-limited, and metadata records are audited. Without R2 configuration, the endpoint responds with `STORAGE_UNAVAILABLE`.

The additive media schema migration is checked in but has not been applied to any database. Verify and back up your database before applying migrations; its current state is unknown.

### Authentication setup

Email/password registration is enabled. Google sign-in is enabled when all of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are set. Add the exact redirect URI (normally `http://localhost:4000/api/v1/auth/google/callback` for local development) to the Google OAuth web client.

To bootstrap the first administrator, set `BOOTSTRAP_ADMIN_EMAIL` to the exact Google-verified email address that should receive the administrator role. Google sign-in configuration requires this value. Only that account can receive the first admin role; other Google sign-ins receive the regular member role. The initial administrator is assigned the `*` permission. Keep the bootstrap email controlled.

Authentication endpoints are under `/api/v1/auth`: `POST /register`, `POST /login`, `POST /logout`, `GET /me`, `GET /providers`, and `GET /google` for the Google redirect flow. Sessions use seven-day, HTTP-only, same-site cookies; their random tokens are HMAC-hashed before storage. Authentication endpoints have per-process rate limits.
