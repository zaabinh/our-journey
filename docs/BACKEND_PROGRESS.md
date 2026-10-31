# Backend progress — 31 October 2026

Base: original main `76342554ba4213a53bafbc274169c3629ebf3a68`. Frontend and backend source are now on main at `c173957cbcef84e9bfe857d7beb2ddff9b2fc35e`; this is not a production deployment. No media, user export, or secret was added. Legacy assets were removed from the current tree and archived in local ignored `.old/`; Git history remains unchanged and still contains the old tracked data.

## Implemented

- FastAPI app/settings, private local storage abstraction and R2 adapter, bounded request body, structured validation/auth errors and request IDs.
- SQLAlchemy schema + frozen initial Alembic operations; PostgreSQL Compose service; Python lockfile and exported production dependencies.
- Argon2 password hashing, opaque DB-backed session cookie, stable session CSRF, Origin validation and PostgreSQL atomic rate limits.
- Album CRUD, memberships/roles, invitation tokens/codes with expiry/revocation and locked usage limits.
- Draft/publish memory CRUD, version conflicts, literal substring search, pagination and complete-list owner-only reorder.
- Validated/re-encoded private image/thumbnail upload, access checks for reads, R2 signed URLs, durable orphan cleanup intent and maintenance command.
- Comment ownership rules and idempotent unique-per-user reactions.
- Read-only legacy JSON/media inventory; never fetches arbitrary URLs or changes original files.
- API tests with synthetic accounts/images; PostgreSQL 16 GitHub Actions workflow; Dockerfile and local/deployment instructions.

## Evidence

Earlier local: Python 3.12; Ruff lint + format checks PASS; compileall PASS. Alembic upgrade/check/downgrade/upgrade PASS. Pytest: 13 passed on PostgreSQL-protocol PGlite; CI on native PostgreSQL 16 passed at commit 3df2e2b (run https://github.com/zaabinh/our-journey/actions/runs/41168266850). Current workspace run: Ruff check and format PASS; native PostgreSQL 18 UTF-8 temporary cluster, Alembic upgrade/check and downgrade/upgrade/check PASS; pytest **13 passed**. One Starlette/httpx TestClient deprecation warning remains.

## Remaining gates

B0 contract: current OpenAPI is executable contract; frontend mapping cannot be verified because main has legacy HTML only. B1–B6 have the implemented API subset above; not every planned feature is complete. Avatars/album cover, timestamps/date filter, photo reorder and crashed-pending reconciliation remain follow-up work. No account recovery or email verification is claimed.

B7 BLOCKED: React source is present, but `JourneyProvider` still uses `LocalRepository`; API auth/session and data mapping are not integrated. Browser tests against the API and Vercel proxy have not run.

B8 PREPARATION ONLY: migration inventory exists; lossless original-preserving apply/resume/rollback is not executed or claimed. Real source export and owner mapping must be verified before an import implementation is applied. No production database was accessed.

B9 PREPARATION ONLY: Docker/config/docs/CI provided. Actual Render/Vercel configuration, private R2 bucket and credential provisioning, R2 smoke test, scheduled cleanup, backup/restore rehearsal and deploy are pending. Production startup fails for local media storage; no paid resource was created.

## Current workspace run — 31 October 2026

- Refactor moved API handlers into `app/api/{auth,albums,memories,social}.py`, with shared helpers in `common.py`, and models/schemas into packages.
- Ruff lint/format PASS; Alembic upgrade/check PASS; downgrade-to-base then upgrade/check PASS; pytest **13 passed** on a dedicated local PostgreSQL 18 UTF-8 test database. The first run caught a missing shared photo-cleanup helper; it was moved to `common.py` and the complete suite passed on rerun.
- Legacy root HTML/CSS/JS, TODO files, and the full `assets/` folder were moved to local `.old/`, now covered by `.gitignore`. Legacy data was not added to a commit. Its existing Git history is unchanged.
- The frontend still uses `LocalRepository`; the HTTP adapter and production auth UI are not implemented. Browser integration has not passed.
- `main` has not been updated, no commit was created, and remote branches were not deleted. The Git index is read-only in this sandbox; connected GitHub tools do not expose branch deletion.

Next: native CI → code review → complete remaining backend features → connect React HTTP adapter → provision/test private storage and deployment topology → implement and rehearse lossless migration on fixture → apply mapped real data after backup verification.
# Progress update — 2026-10-31

- Frontend source was published first on `feat/import-legacy-data` as commit `7df8ae7efb11e3fa1d2df1e1a8350efe532dd57a`. No personal export/media was added by that commit; its brand assets reuse existing repository blobs.
- Backend branch `feat/backend-private-albums` was fetched from origin at `fa59f92d432f4073ec49a36f05afc38cd866b7f5` and copied into the workspace.
- Refactor started: route handlers were split into `app/api/{auth,albums,memories,social}.py`, with shared dependencies/helpers in `app/api/common.py`; models and schemas are package directories. Python bytecode compilation passes.
- Frontend format, lint, typecheck, Vitest (33 tests), Vite build, and build privacy check pass.
- Backend Ruff, pytest, Alembic, PostgreSQL integration, and browser integration have not passed or run: `uv` and Python dependencies are unavailable in this environment. API-to-`JourneyRepository` mapping remains unimplemented. The frontend stays on its local/demo repository.
- Deployment files are preparation only. The Vercel rewrite still has a placeholder Render hostname; R2/Render credentials, paid resource creation, production migrations, and deployment have not been performed.
- The legacy tracked-data audit remains a release blocker (109 private paths); do not remove, rewrite, or publish real legacy data as part of this work.

