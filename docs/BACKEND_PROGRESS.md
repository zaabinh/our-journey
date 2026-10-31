# Backend progress — 31 October 2026

Base: main 76342554ba4213a53bafbc274169c3629ebf3a68. Implementation is on a review branch, not deployed or merged. No real media, user export or secret was added or modified. Existing tracked legacy assets remain present in Git and history; `.gitignore` alone does not remove them. Their removal requires verified backups and a separate data-preservation step.

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

Local: Python 3.12; Ruff lint + format checks PASS; compileall PASS. Alembic upgrade, metadata drift check (no changes), downgrade, upgrade PASS. Pytest: **13 passed** on PGlite 0.5.13 via PostgreSQL protocol/psycopg, including simultaneous invite redemption. PGlite multiplexing is not identical to native PostgreSQL; native PostgreSQL 16 CI is a separate required check. One third-party TestClient/httpx deprecation warning remains. Native PostgreSQL CI result will be reported separately on the PR.

## Remaining gates

B0 contract: current OpenAPI is executable contract; frontend mapping cannot be verified because main has legacy HTML only. B1–B6 have the implemented API subset above; not every planned feature is complete. Avatars/album cover, timestamps/date filter, photo reorder and crashed-pending reconciliation remain follow-up work. No account recovery or email verification is claimed.

B7 BLOCKED: React source/repository interfaces are not in the current branch; needs actual frontend or a separate frontend implementation. Browser/proxy/Safari E2E has not run.

B8 PREPARATION ONLY: migration inventory exists; lossless original-preserving apply/resume/rollback is not executed or claimed. Real source export and owner mapping must be verified before an import implementation is applied. No production database was accessed.

B9 PREPARATION ONLY: Docker/config/docs/CI provided. Actual Render/Vercel configuration, private R2 bucket and credential provisioning, R2 smoke test, scheduled cleanup, backup/restore rehearsal and deploy are pending. Production startup fails for local media storage; no paid resource was created.

Next: native CI → code review → complete remaining backend features → connect React HTTP adapter → provision/test private storage and deployment topology → implement and rehearse lossless migration on fixture → apply mapped real data after backup verification.
