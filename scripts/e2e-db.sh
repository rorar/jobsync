#!/usr/bin/env bash
# Disposable run database for the E2E suite. SOURCE this, do not execute it.
#
# Why this exists
# ---------------
# Until 2026-09-02 the suite ran against prisma/dev.db — the developer's own
# working database, the same file the dev server uses. Everything downstream of
# that fact was a workaround for it:
#
#   - e2e/cleanup-stale-data.ts, 330 lines of foreign-key-ordered deletes, whose
#     only job was removing the previous run's residue from a database that was
#     never supposed to hold it.
#   - The "E2E " name prefix, a convention living in prose and in a `startsWith`
#     filter, which is what that cleanup matched on. It has been broken twice
#     (E2E-B3, and E2E-B22 where four specs write `E2E${uid}` with no space), and
#     each break leaked rows nothing could ever remove again.
#   - E2E_ALLOW_DESTRUCTIVE, gating the one unfiltered delete — which protected
#     exactly that one statement while every other cleanup write went to dev.db
#     by design.
#
# A copy of a SQLite file removes the cause rather than managing it. What the
# suite cannot reach, it cannot corrupt, and what dies with the run cannot leak
# into the next one.
#
# Spec: specs/e2e-test-infrastructure.allium — DisposableRunDatabase,
# ProvisionRunDatabase, DiscardRunDatabase, RunDatabaseIsNeverTheWorkingDatabase.

E2E_DB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E_TEMPLATE_DB="$E2E_DB_ROOT/prisma/.e2e-template.db"
E2E_TEMPLATE_STAMP="$E2E_DB_ROOT/prisma/.e2e-template.stamp"
E2E_RUN_DB="$E2E_DB_ROOT/prisma/.e2e-run.db"

# Inputs whose change invalidates the template. Schema and migrations decide its
# shape; the two seeds decide its contents. Anything else that starts mattering
# must be added here, or a run will silently use a template that predates it.
_e2e_db_stamp() {
  {
    sha256sum "$E2E_DB_ROOT/prisma/schema.prisma" 2>/dev/null
    sha256sum "$E2E_DB_ROOT/prisma/seed.ts" 2>/dev/null
    sha256sum "$E2E_DB_ROOT/prisma/seed-e2e.ts" 2>/dev/null
    find "$E2E_DB_ROOT/prisma/migrations" -type f -name '*.sql' -print0 2>/dev/null \
      | sort -z | xargs -0 -r sha256sum
  } | sha256sum | cut -d' ' -f1
}

# Remove a SQLite database AND its sidecars.
#
# -wal and -shm are not incidental: copying a .db while a -wal exists yields a
# torn snapshot that opens fine and is missing the most recent writes. Deleting
# the .db alone and leaving a -wal behind is the same bug with the halves
# swapped. They travel together or not at all.
_e2e_db_rm() {
  rm -f "$1" "$1-wal" "$1-shm"
}

# Build the template: migrate to head, seed base, seed E2E fixtures, checkpoint.
#
# DATABASE_URL is set INSIDE each command rather than exported once, because an
# export that outlives its intended scope is how `prisma migrate deploy` ends up
# pointed at dev.db. It is an absolute path: the generated client resolves a
# relative SQLite path against the schema directory, not $PWD, and that
# discrepancy is silent until the wrong file gets written.
e2e_db_build_template() {
  echo "[e2e-db] building template (schema/migrations/seeds changed or absent) ..."
  _e2e_db_rm "$E2E_TEMPLATE_DB"

  local url="file:$E2E_TEMPLATE_DB"

  if ! DATABASE_URL="$url" bunx prisma migrate deploy >/dev/null; then
    echo "[e2e-db] ERROR: prisma migrate deploy failed against the template." >&2
    return 1
  fi
  if ! DATABASE_URL="$url" bun run "$E2E_DB_ROOT/prisma/seed.ts"; then
    echo "[e2e-db] ERROR: base seed failed." >&2
    return 1
  fi
  if ! DATABASE_URL="$url" bun run "$E2E_DB_ROOT/prisma/seed-e2e.ts"; then
    echo "[e2e-db] ERROR: E2E fixture seed failed." >&2
    return 1
  fi

  # Fold the WAL back into the file so the template is one self-contained
  # artefact. Without this the copy below depends on whether Prisma happened to
  # checkpoint on disconnect.
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$E2E_TEMPLATE_DB" "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;" >/dev/null
  fi
  rm -f "$E2E_TEMPLATE_DB-wal" "$E2E_TEMPLATE_DB-shm"

  _e2e_db_stamp > "$E2E_TEMPLATE_STAMP"
  echo "[e2e-db] template ready: $(du -h "$E2E_TEMPLATE_DB" | cut -f1)"
}

e2e_db_template_is_current() {
  [ -f "$E2E_TEMPLATE_DB" ] || return 1
  [ -f "$E2E_TEMPLATE_STAMP" ] || return 1
  [ "$(cat "$E2E_TEMPLATE_STAMP")" = "$(_e2e_db_stamp)" ]
}

# Provision this run's database and export DATABASE_URL for every child process.
#
# The previous run's file is discarded HERE, at provision time, not at exit.
# Two reasons, both learned the hard way elsewhere in this repo: a red run
# leaves its data inspectable for post-mortem instead of vanishing with the
# failure, and deleting a file out from under the still-running dev server would
# leave the operator with a server bound to an unlinked inode. E2E_KEEP_RUN_DB=0
# opts into deleting at exit.
e2e_db_provision_run() {
  e2e_db_template_is_current || e2e_db_build_template || return 1

  _e2e_db_rm "$E2E_RUN_DB"
  cp "$E2E_TEMPLATE_DB" "$E2E_RUN_DB" || return 1

  export DATABASE_URL="file:$E2E_RUN_DB"
  echo "[e2e-db] run database: $E2E_RUN_DB (dev.db is not opened by this run)"
}

e2e_db_discard_run() {
  _e2e_db_rm "$E2E_RUN_DB"
  echo "[e2e-db] run database discarded"
}
