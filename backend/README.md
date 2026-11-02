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

Production refuses local storage; set `OJ_ENVIRONMENT=production`, `OJ_STORAGE_DRIVER=r2`, HTTPS origins and all R2 secrets from `.env.example`. Email verification and password recovery need `OJ_PUBLIC_WEB_URL`, `OJ_RESEND_API_KEY`, `OJ_SMTP_USERNAME` (display name), `OJ_SMTP_FROM` (sender local-part or full address), and `OJ_SMTP_HOST` (sender domain when using a local-part). Set `OJ_PUBLIC_WEB_URL` to the deployed frontend's HTTPS domain in Render; startup now fails if it is unset or points to localhost, rather than generating localhost email links. Register/recovery return a service error until Resend and sender identity are configured. Bucket must be private; public access must be checked in the account. No storage/email credential is sent to the browser. Real R2/Resend smoke tests need the owner's accounts.

Durable cleanup intent is inserted before writing files. A failed upload stays pending and hidden; cleanup removes orphan objects. Deletes immediately block reads but remove bytes asynchronously. Run at least hourly:

```sh
uv run python -m app.maintenance
```

Jobs younger than one hour are quarantined; retries are idempotent. Expired auth/limiter records are purged. Failed uploads are hidden and excluded from the photo quota; their objects remain queued for cleanup. A process crash can leave pending metadata that still needs reconciliation. No backup claim is made: arrange database **and** object backup and test restore before production use.

## Email

Templates live in `app/services/email_templates.py` (one responsive layout plus a copy catalog keyed by kind); delivery uses the Resend HTTP API in `app/services/mail.py`. Every email greets the recipient as "Chào bạn, **display_name**" (escaped) or "Chào bạn," without a name, and ships an HTML and a plain-text part. The header image is `frontend/public/brand/email-header.png`, served at `OJ_EMAIL_HEADER_URL` (default `OJ_PUBLIC_WEB_URL/brand/email-header.png`; production requires HTTPS). Mail clients cannot load it from `localhost`, so local emails show the alt text instead.

Delivery paths:

- **Direct, synchronous:** verification and password-reset links. Raw tokens exist only in the email, never in the database.
- **Direct, after commit:** album invites (the invite token is not stored) and upload-failure notices (the request rolls back, so there is nothing to commit).
- **Outbox (`email_outbox`):** everything else. Rows are written in the request transaction, so they exist only if the change commits. One row per event and recipient (`dedupe_key`); self-notifications are excluded. An in-process worker sends them after commit, re-checks at send time that the recipient is verified, has not opted out (activity only) and can still see the album or memory, and retries with backoff (1 min, 5 min, 30 min, 2 h; `failed` after 5 attempts). Retries reuse the row id as Resend's `Idempotency-Key`. `python -m app.maintenance` also flushes due rows and deletes finished rows after 30 days.

Security notices (`password_changed`, `profile_updated`, and the template-only `email_changed` and `suspicious_login`) ignore the opt-out. Activity emails respect `users.email_notifications`, set with `PATCH /users/me {"display_name": ..., "email_notifications": false}`; the frontend has no toggle yet.

| Email | Trigger |
|---|---|
| Verify email, reset password | register, resend verification, reset request |
| Album invite (role, expiry) | invite created with `recipient_email` |
| Invite accepted | invite redeemed; notifies the owner |
| Memory published | first publish; notifies owner and members except the author |
| New comment | comment on someone else's memory; notifies the memory author |
| Mention | `@username` of someone who can see the album |
| Role change, removal, leave | owner changes role or removes a member; member leaves (notifies owner) |
| Password changed | password reset confirmed |
| Display name changed | `PATCH /users/me` with a new name |
| Upload failure | storage backend fails while saving a photo or avatar |
| Comment reply | **template only**: comments are flat, no reply/thread model |
| Email changed | **template only**: no change-email endpoint |
| Suspicious login | **template only**: no login-risk detection |

Local smoke test without sending: run the stack, leave `OJ_RESEND_API_KEY` empty, trigger an action (for example publish a memory in a shared album), then inspect `SELECT kind, status, attempts, last_error FROM email_outbox`. Without credentials rows retry with `EMAIL_NOT_CONFIGURED` and end as `failed`. To send for real, set the Resend variables and use your own addresses.

## Tests

Set `OJ_TEST_DATABASE_URL` to a dedicated disposable PostgreSQL database. The test harness refuses to start without it, overrides `OJ_DATABASE_URL`, forces `OJ_ENVIRONMENT=test` (so no real Resend requests are made), and truncates tables before each test. Never point it at local/production user data.

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

Open items: deployment/restore rehearsal; real Resend and R2 smoke tests; continuation for large member/invite lists; reliable cleanup reconciliation for process crashes. Until these gates pass this is a reviewable implementation, not a completed production release.
