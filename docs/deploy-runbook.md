# JobSync — Production Deploy & Backfill Runbook

Ordered, copy-pasteable steps to deploy the **fork** (`rorar/jobsync`) self-hosted via
Docker Compose, run the optional salary backfill, verify, and roll back.

> **Scope.** This runbook is for the fork. The upstream image
> (`ghcr.io/gsync/jobsync`) lacks Welle 0/1/2 and carries the cover-letter divergence —
> never deploy it for this fork. See [§8.5 cross-reference](#existing-upstream-db-switchers)
> if you are migrating an existing **upstream** database.

---

## 0. Decisions & assumptions (defaults chosen here)

These were genuine operator decisions; sustainable defaults are baked into the config and
documented so you can change them deliberately.

| Decision | Default chosen | Alternative |
|---|---|---|
| Image source | **Build from source** (`docker compose up -d --build`) — zero registry dependency | Pull published image via `docker-compose.ghcr.yml` override |
| Registry | GitHub Container Registry (GHCR) | Any OCI registry — change `IMAGE_NAME`/`REGISTRY` in `.github/workflows/docker-publish.yml` |
| Image name | `ghcr.io/rorar/jobsync` | Set `JOBSYNC_IMAGE` env var to override at deploy time |
| Architectures | `linux/amd64` + `linux/arm64` (Pi/Synology/Apple Silicon) | Trim `platforms:` in the publish workflow for faster builds |
| Deploy host model | Single host, single Docker volume (`./jobsyncdb/data`) | Multi-host/orchestrated — out of scope |

---

## 1. Prerequisites & secrets

Create a `.env` next to `docker-compose.yml` on the **deploy host** (gitignored; never
commit). Compose reads it automatically.

```bash
cd /opt/jobsync          # your deploy directory
cp .env.example .env      # then edit — see required vars below
```

| Variable | Required? | Notes |
|---|---|---|
| `AUTH_SECRET` | **YES** | App **refuses to start** without it (ADR-018, enforced in `docker-entrypoint.sh`). `openssl rand -base64 32`. Stable across restarts — changing it invalidates all sessions. |
| `ENCRYPTION_KEY` | **YES (real value)** | Encrypts stored API keys at rest (ADR-017). The compose default `you-encryption-key-here` is a **placeholder** — set a real stable value: `openssl rand -base64 32`. Changing it later makes already-stored keys unrecoverable. |
| `ADMIN_USER_IDS` | Multi-user only | Comma-separated user-id allowlist for admin actions (CLAUDE.md § Admin Tiered Rule). **Single-user: leave unset** (sole user is implicit admin). Multi-user that forgets this → admin toggles silently denied until set + restart. |
| `NEXTAUTH_URL` | YES | Public URL of the instance, e.g. `https://jobs.example.com` or `http://192.168.1.10:3737`. |
| `TZ` | Recommended | e.g. `Europe/Berlin`. Wrong TZ shifts activity timestamps. |
| `AUTH_TRUST_HOST` | Default `true` | Keep `true` behind a reverse proxy. |
| `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` | Optional | Cloud AI providers. Omit for local-only (Ollama). |
| `OLLAMA_BASE_URL` | Optional | Defaults to `http://host.docker.internal:11434`. |
| `RAPIDAPI_KEY` | Optional | JSearch / OpenWeb Ninja job discovery. |
| `LOGODEV_API_KEY` | Optional | Higher-quality logos; falls back to Google Favicon without it. |

Minimal real-deployment `.env`:

```dotenv
AUTH_SECRET=<openssl rand -base64 32>
ENCRYPTION_KEY=<openssl rand -base64 32>
NEXTAUTH_URL=https://jobs.example.com
TZ=Europe/Berlin
# ADMIN_USER_IDS=<id1>,<id2>   # only if multi-user
```

---

## 2. Back up the database FIRST

The DB is a single SQLite file on the mounted volume (`./jobsyncdb/data/dev.db`). Always
copy it before any deploy or backfill — the deploy auto-runs migrations.

```bash
cd /opt/jobsync
mkdir -p backups
# Quiesce writes for a consistent copy: stop the app if it is running.
docker compose stop app 2>/dev/null || true
cp jobsyncdb/data/dev.db "backups/dev.db.$(date +%Y%m%d-%H%M%S)"
# (Fresh install with no existing DB? Nothing to back up — skip.)
```

Keep the timestamped copy until you have verified the new deploy (step 5).

---

## 3. Deploy

Migrations apply **automatically** on container start: the entrypoint runs
`prisma migrate deploy` before launching the server. There is **no manual migrate step**.
All fork migrations are additive (new tables + nullable columns), so they are safe to apply
forward; `Job.salaryRange` is retained (deprecated) so legacy salaries survive (§8.5).

### Option A — build from source (default, recommended)

```bash
cd /opt/jobsync
git pull                       # get the latest fork main (or check out a release tag)
docker compose up -d --build   # builds Dockerfile, runs migrate deploy, starts app
docker compose logs -f app     # watch: "migrate deploy" output, then server start
```

### Option B — pull the published fork image

Requires the publish workflow to have run (`.github/workflows/docker-publish.yml`).

```bash
cd /opt/jobsync
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
# Pin a version instead of :latest:
#   JOBSYNC_IMAGE=ghcr.io/rorar/jobsync:v1.2.3 docker compose \
#     -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

---

## 4. Salary backfill (OPTIONAL — only fills pre-existing jobs)

`scripts/migrate-job-salary-structured.ts` parses legacy free-text `Job.salaryRange` into
structured `salaryMin/Max/Currency/Period`. It is **idempotent** (only touches rows where
the structured fields are still null) and supports `DRY_RUN`. New jobs created after the
deploy already get structured salary — this is purely for jobs that existed before Welle 2.

> **Why not `docker exec` inside the deployed container?**
> The production image uses Next.js **standalone** output. The runner stage copies only
> `public`, `prisma`, `.next/standalone`, `.next/static` — it does **not** include
> `scripts/`, `src/`, the `tsx` runner, or the `@/` path-alias tooling the script needs.
> So `docker exec jobsync_app npx tsx scripts/...` will fail (file/runner absent). Run the
> backfill from a **source checkout** pointed at the prod DB instead.

**Accurate procedure — run from a source checkout against the prod DB:**

```bash
# On the deploy host (or any machine that can reach the DB file), in a clone of the fork:
cd /path/to/jobsync-source        # git clone git@github.com:rorar/jobsync.git
bun install                        # dev deps incl. the script's runtime
bunx prisma generate

# Point the script at the PROD DB. Strongly prefer a COPY so a parse bug can't touch prod:
cp /opt/jobsync/jobsyncdb/data/dev.db /tmp/backfill-test.db
DATABASE_URL="file:/tmp/backfill-test.db" DRY_RUN=1 \
  bun scripts/migrate-job-salary-structured.ts     # 1) preview on a copy, no writes

# Reviewed the dry-run counts? Apply to the real prod DB (app stopped, fresh backup taken):
docker compose -f /opt/jobsync/docker-compose.yml stop app
DATABASE_URL="file:/opt/jobsync/jobsyncdb/data/dev.db" DRY_RUN=1 \
  bun scripts/migrate-job-salary-structured.ts     # 2) dry-run against real DB
DATABASE_URL="file:/opt/jobsync/jobsyncdb/data/dev.db" \
  bun scripts/migrate-job-salary-structured.ts     # 3) real write
docker compose -f /opt/jobsync/docker-compose.yml up -d app
```

Notes:
- The script reports unparseable values and leaves them as-is (legacy `salaryRange` kept) —
  nothing is silently dropped.
- Use `bun` (the project's documented runner; resolves the `@/` alias + tsconfig paths).
  `bunx tsx scripts/...` also works if you prefer tsx, but `bun` matches the script header.
- Stop the app during the real write so SQLite has a single writer.

---

## 5. Verify

```bash
# Container healthy?
docker compose ps                       # STATUS shows "healthy" after start_period
docker inspect --format '{{.State.Health.Status}}' jobsync_app   # -> healthy

# App responds?
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3737    # -> 200/302
```

- Sign in; open a job that previously showed a free-text salary range and confirm it now
  renders **structured** salary (min/max/currency/period) after the backfill.
- Check `docker compose logs app` for a clean `migrate deploy` (no drift errors) and no
  startup `FATAL: AUTH_SECRET is not set`.

---

## 6. Rollback

Schema migrations are additive, so a code/image rollback is safe **as long as you also
restore the matching DB backup** (a new migration applied by the failed deploy can be
ahead of the old code).

```bash
cd /opt/jobsync
docker compose down

# Restore the DB backup taken in step 2:
cp "backups/dev.db.<TIMESTAMP>" jobsyncdb/data/dev.db

# Redeploy the previous version:
#  - build-from-source: check out the previous tag/commit, then up --build
git checkout <previous-tag-or-commit>
docker compose up -d --build
#  - published image: pin the previous tag
#    JOBSYNC_IMAGE=ghcr.io/rorar/jobsync:<previous> docker compose \
#      -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

Never run destructive migrations (DROP/ALTER NOT NULL) before old code is fully retired —
the fork's migrations are additive precisely so rollback stays safe.

---

## Existing-upstream-DB switchers

Migrating a database that was running the **upstream** (`Gsync/jobsync`) image is **not** a
plain deploy. Per **ROADMAP §8.5**:

- **Fresh install → fork: safe today.** All fork migrations apply from scratch.
- **Existing upstream DB → fork: blocked** by one upstream-only migration
  `20260326034736_add_cover_letter` (creates `CoverLetter`, redefines `Job`/`Resume`). The
  fork has no `coverLetter`, so `prisma migrate deploy` reports **drift** and refuses; the
  fork's rebuild migrations collide with the cover-letter-shaped schema.
- This needs the **8.5 bridge** (backup + schema-mapping + rollback) **and** a deliberate
  cover-letter port-vs-drop decision — do **not** `git merge upstream`. See ROADMAP §8.5
  for the full divergence analysis before attempting it.

---

## Reference

- Compose (build path): `docker-compose.yml`
- Compose (pull override): `docker-compose.ghcr.yml`
- Publish pipeline: `.github/workflows/docker-publish.yml`
- Entry point / auto-migrate: `docker-entrypoint.sh`
- Backfill script: `scripts/migrate-job-salary-structured.ts`
- Upstream divergence: `docs/ROADMAP.md` §8.5
- Security/config invariants: `CLAUDE.md` (ADR-017 encryption, ADR-018 AUTH_SECRET, Admin Tiered Rule)
