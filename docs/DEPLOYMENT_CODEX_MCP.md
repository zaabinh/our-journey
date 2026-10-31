# Deployment setup for Codex

This repository contains deployment configuration, not a live deployment. Do not run `render blueprint apply`, `vercel deploy --prod`, create paid resources, migrate personal data, or change DNS until the owner explicitly requests that operation.

## Service topology

- Vercel serves the Vite app from `frontend/`. `frontend/vercel.json` proxies `/api/*` to the Render API so the browser uses same-origin cookies.
- Render runs the API from `backend/Dockerfile` and provisions PostgreSQL from `render.yaml`.
- Cloudflare R2 is configured as a private S3-compatible bucket. Browser clients never receive R2 credentials.

## One-time account setup

1. Connect the GitHub repository to Render and create a Blueprint from `render.yaml`. Review database plan, region, and resulting charges in the dashboard before applying it.
2. In Cloudflare, create a private R2 bucket and an API token limited to Object Read & Write for that bucket. Copy endpoint, bucket name, access key, and secret into the Render environment variables. Never add credentials to Git or Codex prompts.
3. Set `OJ_ALLOWED_ORIGINS` on Render to a JSON array containing the exact HTTPS Vercel production origin and any explicitly approved preview origin.
4. Set the Vercel project root directory to `frontend/`. Add its domain to the Render allowed origins, then check that the rewrite destination matches the service's actual Render hostname. The current hostname is a placeholder until Render creates the service.
5. Install the GitHub, Render, Vercel, and Cloudflare MCP integrations in Codex. Grant only repository access for the target repo and service-management permissions needed for deployment. Keep secrets in the providers' secret stores.

## Codex deployment procedure

Codex should first inspect the branch, working tree, relevant deployment files, provider account IDs, and current service state through MCP. It should run the frontend checks, backend lint/tests, migration check, API smoke tests, privacy audit, and a browser test covering login, reload/session restoration, memory/photo access, and logout. It must compare the exact deployment commit and configuration against the approved branch, verify production DB/R2 environment variables are set without printing their values, and confirm database/object backups plus a restore rehearsal.

Codex may prepare a deployment plan and report the exact commit, provider resources, migrations, expected cost, and rollback steps. A live deployment, paid resource creation, DNS change, or production data migration requires a separate explicit user instruction. Never rewrite history or push legacy personal exports/media as part of deployment.

## Current release gates

- The React `JourneyRepository` is still local/demo-only; `frontend/src/data/http/README.md` is the adapter design note. A browser-tested API adapter must be implemented before these services can power the product.
- The backend refactor and tests must pass in an environment with the pinned Python toolchain and an empty PostgreSQL test database.
- Replace the Render placeholder hostname in `frontend/vercel.json` after creating/reviewing the service.
- Configure and smoke-test private R2 access, same-origin cookies, Vercel proxy behavior, migrations, backups, and restore before production traffic.
- The tracked private-data audit currently blocks release. Preserve those existing files and resolve their history/retention policy separately; never include them in a new deployment commit.
