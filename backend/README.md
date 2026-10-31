# Our Journey API

FastAPI / PostgreSQL backend. The repository's current legacy HTML app is **not yet connected** to this API. No real personal data is seeded. API docs: `/docs`; API prefix: `/api/v1`.

## Local development

From repository root:

```sh
docker compose -f compose.backend.yaml up -d --wait
cd backend
cp .env.example .env
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

`uv` is the Python package manager. `uv.lock` is committed; use `uv sync --frozen` for reproducible installs. Compose credentials are local examples only. Local media is outside the Git index under `.private-data/uploads`; do not expose that directory as static files.

## Authentication contract

Browser requests use a **same-origin** `/api` proxy (Vite locally, Vercel in deployment). Register/login require an allowed `Origin`. Login returns public user + `csrf_token`, and sets an opaque `oj_session` HttpOnly cookie. Store CSRF in memory and send `X-CSRF-Token` on all mutations with the cookie. After reload, GET `/api/v1/auth/csrf` returns the stable session token. GET `/api/v1/auth/session` restores the user. Logout revokes the DB session. Tokens/passwords are never stored in frontend localStorage.

The server does not trust `X-Forwarded-For`; the platform's forwarding trust must be configured before using forwarded IP for limits. Per-identity PostgreSQL rate limits still work across processes. Do not use direct cross-site onrender.com cookies without a browser-tested topology. Do not enable wildcard credentialed CORS.

## Main workflow

1. Register/login, create album.
2. Owner creates invitation (`contributor` or `viewer`); recipient redeems token/code while logged in.
3. POST memory creates a draft. Upload 1–10 valid JPEG/PNG/WebP files. POST `/memories/{id}/publish` makes it visible to readers.
4. Owner edits any memory; contributors edit their own. Viewers only read. Owner may delete others' comments but cannot edit their words.
5. PATCH album/memory/comment uses `expected_version`; stale writes return 409. Reorder currently **owner only**, requires all active memory IDs and album version; never send only filtered results.
6. POST photo read-url returns an authorized local URL or 120-second R2 URL. Thumbnail and full image both private. Revoked members cannot obtain new URLs; existing signed URLs expire naturally.

GET lists are bounded (memories/comments/albums cursor pagination). List members/invites is currently capped at 100 without continuation; large-group support is backlog. Search matches title/location/note; date filtering and photo reorder are backlog. Photos are re-encoded as JPEG with EXIF/GPS removed; source originals must remain in external backup for lossless migration.

## Storage and maintenance

Production refuses local storage; set `OJ_ENVIRONMENT=production`, `OJ_STORAGE_DRIVER=r2`, HTTPS origins and all R2 secrets from `.env.example`. Bucket must be private; public access must be checked in the account. No R2 credential is sent to the browser. The production bucket/privacy check and real R2 smoke tests need the owner's account.

Durable cleanup intent is inserted before writing files. A failed upload stays pending and hidden; cleanup removes orphan objects. Deletes immediately block reads but remove bytes asynchronously. Run at least hourly:

```sh
uv run python -m app.maintenance
```

Jobs younger than one hour are quarantined; retries are idempotent. Expired auth/limiter records are purged. Failed uploads are hidden and excluded from the photo quota; their objects remain queued for cleanup. A process crash can leave pending metadata that still needs reconciliation. No backup claim is made: arrange database **and** object backup and test restore before production use.

## Tests

Use a dedicated empty PostgreSQL database (`OJ_DATABASE_URL`) because the suite deletes application rows. Never run tests against real user data.

```sh
uv run ruff check .
uv run ruff format --check .
uv run alembic upgrade head
uv run alembic check
uv run pytest -q
```

Tests exercise auth/CSRF, DB rate limits, role boundaries, invite race/expiry, conflicts, photo validation/failure, comments/reactions, reorder/pagination and read-only migration inventory. They use generated images only. No real R2 or browser tests are implied by API tests.

## Existing data

`uv run python -m app.migration /private/export.json --media-root /private/root` inventories legacy data without modifying it, following URLs or writing to the DB. Output contains counts/checksums only. Owner mapping, original-preserving import apply/resume/rollback and database/object backup restore remain gates before real migration. Existing media already committed in Git history has **not** been removed by adding `.gitignore`.

## Deployment preparation

Dockerfile supports Render's `$PORT`. Run `alembic upgrade head` once in a pre-deploy step, not in every web worker. Set health check `/health/ready`. R2 is the durable media store, not Render's ephemeral filesystem. Verify cookie forwarding through the Vercel proxy on Safari/iOS and other target browsers before release. No services are created, billed or deployed by this branch.

Open items: React HTTP adapter/browser E2E; avatars/album cover; timestamps/date filters; reliable retry/finalize for failed upload metadata; lossless import apply; account recovery/email verification; deployment/restore rehearsal. Until these gates pass this is a reviewable backend implementation, not a completed production release.
