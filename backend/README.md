# Our Journey API

FastAPI / PostgreSQL backend used by the React HTTP repository. No real personal data is seeded. API docs: `/docs`; API prefix: `/api/v1`.

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

GET lists are bounded (memories/comments/albums cursor pagination). Memory listing supports `date_from`/`date_to`; ready photo order can be changed with `PUT /memories/{id}/photo-order`. List members/invites remains capped at 100 without continuation. Memories support either a date-only value or a legacy date label. Photos are re-encoded as JPEG with EXIF/GPS removed; source originals must remain in external backup for lossless migration.

## Storage and maintenance

Production refuses local storage; set `OJ_ENVIRONMENT=production`, `OJ_STORAGE_DRIVER=r2`, HTTPS origins and all R2 secrets from `.env.example`. Email verification and password recovery need `OJ_PUBLIC_WEB_URL`, `OJ_SMTP_HOST`, `OJ_SMTP_PORT`, `OJ_SMTP_USERNAME`, `OJ_SMTP_PASSWORD`, and `OJ_SMTP_FROM`; register/recovery return a service error until SMTP host/from are configured. Bucket must be private; public access must be checked in the account. No storage/email credential is sent to the browser. Real R2/SMTP smoke tests need the owner's accounts.

Durable cleanup intent is inserted before writing files. A failed upload stays pending and hidden; cleanup removes orphan objects. Deletes immediately block reads but remove bytes asynchronously. Run at least hourly:

```sh
uv run python -m app.maintenance
```

Jobs younger than one hour are quarantined; retries are idempotent. Expired auth/limiter records are purged. Failed uploads are hidden and excluded from the photo quota; their objects remain queued for cleanup. A process crash can leave pending metadata that still needs reconciliation. No backup claim is made: arrange database **and** object backup and test restore before production use.

## Tests

Set `OJ_TEST_DATABASE_URL` to a dedicated disposable PostgreSQL database. The test harness refuses to start without it, overrides `OJ_DATABASE_URL`, forces `OJ_ENVIRONMENT=test` (so no real SMTP is used), and truncates tables before each test. Never point it at local/production user data.

```sh
export OJ_TEST_DATABASE_URL='postgresql+psycopg://journey_test:journey_test@localhost:5432/journey_test'
uv run ruff check .
uv run ruff format --check .
uv run alembic upgrade head
uv run alembic check
uv run pytest -q
```

Tests exercise auth/CSRF, DB rate limits, role boundaries, invite race/expiry, conflicts, photo validation/failure, comments/reactions, reorder/pagination and read-only migration inventory. They use generated images only. No real R2 or browser tests are implied by API tests.

## Existing data

`uv run python -m app.import_legacy /private/export.json --source-name reviewed-export-v1 --album-id ALBUM_UUID --owner-map /private/owner-map.json` performs a dry run; add `--apply` only after reviewing its count/error report. It accepts the old record-array format and version-1 Our Journey exports, requires explicit legacy-owner-to-user mapping, reads local files/data URLs/base64 image payloads only, preserves unknown source fields in migration metadata, and retains legacy date labels when dates are missing or non-ISO. It checkpoints by source + legacy ID + payload/image hash and resumes matching partial imports. Changed payload under an imported ID is rejected. Never run apply against production until a source backup and database/object backup restore have been verified. Existing media already committed in Git history has **not** been removed by adding `.gitignore`.

## Deployment preparation

Dockerfile supports Render's `$PORT`. Run `alembic upgrade head` once in a pre-deploy step, not in every web worker. Set health check `/health/ready`. R2 is the durable media store, not Render's ephemeral filesystem. Verify cookie forwarding through the Vercel proxy on Safari/iOS and other target browsers before release. No services are created, billed or deployed by this branch.

Open items: deployment/restore rehearsal; real SMTP and R2 smoke tests; continuation for large member/invite lists; reliable cleanup reconciliation for process crashes. Until these gates pass this is a reviewable implementation, not a completed production release.
