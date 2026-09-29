#!/usr/bin/env bash
# Sample the E2E run database DURING a run and log every row that appears or
# disappears, with a wall-clock timestamp on the same clock as the server log.
#
# Why this exists. When an E2E test fails on "the thing I created is not
# there", the first question is whether the SERVER WAS EVER ASKED — a request
# the browser never sent (E2E-B43: a controlled input wiped by a late
# transition) and a request the server abandoned mid-restart (E2E-B42, and the
# `job-detail-panels.spec.ts:440` casualty recorded under E2E-B35) look
# identical from the runner's side. The database answers it, but only if it is
# read WHILE the test runs: every spec's cleanup deletes what it created and
# `e2e/helpers/admin-reference-cleanup.ts` treats a row that was never written
# as already gone, so a query after the run returns the same empty table for
# both hypotheses. This settled E2E-B43 ("KBMulti1 appeared, KBMulti2 never
# did") and attributed E2E-B35's `:440` failure (the status change was in the
# database 0.9 s before the watchdog line; the next navigation got
# ERR_CONNECTION_REFUSED).
#
# Output — one line per change, e.g.
#   20:06:58.212 + JobStatusHistory|cmtr…|8510…  5c11…->e231…
#   20:06:58.212 - Job|8510…|title=06a0… status=5c11…
# `+` appeared, `-` disappeared (an UPDATE shows as one `-` and one `+`).
# The timestamp is local HH:MM:SS.mmm, so it lines up with
# `/tmp/jobsync-e2e-dev.log` and with the `window=` column scripts/test-e2e.sh
# derives from the JSON report.
#
# Usage:
#   scripts/e2e-db-watch.sh [DB] [OUT] [INTERVAL]
#     DB        default: $E2E_RUN_DB, else prisma/.e2e-run.db
#     OUT       default: /tmp/jobsync-e2e-db-watch.log (truncated per start)
#     INTERVAL  seconds between samples, default 0.5
#   Start it AFTER the run database has been provisioned (the wrapper prints
#   "[e2e-db] run database:"); started earlier it baselines the PREVIOUS run's
#   file and logs the whole provisioning as deletions. `E2E_DB_WATCH=1
#   ./scripts/test-e2e.sh` does that for you and keeps the log beside the
#   report. Stop with SIGTERM/SIGINT; the last line reports how many samples
#   succeeded and how many hit a busy database.
#
# Observer effect, stated rather than hidden: each sample opens the database
# read-only and holds a SHARED lock for the few milliseconds the query takes;
# `.timeout 300` makes a sample WAIT rather than fail when Prisma is mid-commit.
# A writer that arrives during a sample waits up to that long. At 0.5 s
# intervals this has not measurably changed a run (E2E-B35's runs 2-6 were
# sampled throughout and matched unsampled durations), but a race that is
# sensitive to a millisecond of lock wait could in principle move. If a flake
# disappears under the sampler, that is information, the same as under
# `--trace=on`.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

DB="${1:-${E2E_RUN_DB:-prisma/.e2e-run.db}}"
OUT="${2:-/tmp/jobsync-e2e-db-watch.log}"
IV="${3:-0.5}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "[e2e-db-watch] sqlite3 not found; nothing to sample with." >&2
  exit 1
fi

ts() { date +%T.%N | cut -c1-12; }

# Every table a spec writes through the UI, reduced to `table|id|label` so
# that a diff between two samples names the row a test claims to have created.
# `_JobToTag` has no id: its pair IS the identity. Add a table here when a spec
# starts creating rows in it, or its creates are invisible to this tool.
Q="SELECT 'Tag',id,label FROM Tag
UNION ALL SELECT 'JobTitle',id,label FROM JobTitle
UNION ALL SELECT 'Company',id,label FROM Company
UNION ALL SELECT 'Location',id,label FROM Location
UNION ALL SELECT 'JobSource',id,label FROM JobSource
UNION ALL SELECT 'JobStatus',id,label FROM JobStatus
UNION ALL SELECT 'JobStatusCategory',id,label FROM JobStatusCategory
UNION ALL SELECT 'Job',id,'title='||jobTitleId||' status='||statusId FROM Job
UNION ALL SELECT 'JobStatusHistory',id,jobId||' '||coalesce(previousStatusId,'null')||'->'||newStatusId FROM JobStatusHistory
UNION ALL SELECT 'JobToTag',A||'/'||B,'' FROM _JobToTag
UNION ALL SELECT 'JobContact',id,jobId||' '||personId||' '||coalesce(role,'') FROM JobContact
UNION ALL SELECT 'Resume',id,title FROM Resume
UNION ALL SELECT 'Task',id,title FROM Task
UNION ALL SELECT 'Activity',id,activityName FROM Activity
UNION ALL SELECT 'Question',id,question FROM Question
UNION ALL SELECT 'Note',id,jobId FROM Note
UNION ALL SELECT 'Person',id,firstName||' '||lastName||' '||status FROM Person
UNION ALL SELECT 'PersonConnection',id,fromPersonId||'->'||toPersonId FROM PersonConnection
UNION ALL SELECT 'CrmTask',id,title||' '||status FROM CrmTask
UNION ALL SELECT 'CrmNote',id,title FROM CrmNote
UNION ALL SELECT 'CrmInterview',id,jobId||' '||status FROM CrmInterview
UNION ALL SELECT 'Referral',id,kind||' '||status FROM Referral
UNION ALL SELECT 'Automation',id,name||' '||status FROM Automation
UNION ALL SELECT 'StagedVacancy',id,title||' '||status FROM StagedVacancy
UNION ALL SELECT 'WebhookEndpoint',id,url FROM WebhookEndpoint
UNION ALL SELECT 'SmtpConfig',id,host FROM SmtpConfig
UNION ALL SELECT 'WebPushSubscription',id,'' FROM WebPushSubscription
UNION ALL SELECT 'ApiKey',id,label FROM ApiKey
UNION ALL SELECT 'PublicApiKey',id,name FROM PublicApiKey
UNION ALL SELECT 'CompanyBlacklist',id,pattern FROM CompanyBlacklist
UNION ALL SELECT 'ModuleRegistration',id,moduleId||' '||status FROM ModuleRegistration;"

prev="$(mktemp)"; cur="$(mktemp)"; : > "$prev"
ok=0; fail=0; first=1
trap 'printf "%s watch stop ok=%s busy=%s\n" "$(ts)" "$ok" "$fail" >> "$OUT"; rm -f "$prev" "$cur"; trap - EXIT; exit 0' EXIT INT TERM

: > "$OUT"
printf '%s watch start db=%s interval=%s\n' "$(ts)" "$DB" "$IV" >> "$OUT"
echo "[e2e-db-watch] sampling $DB every ${IV}s -> $OUT"

while :; do
  if [ -f "$DB" ] && sqlite3 -readonly -cmd ".timeout 300" "$DB" "$Q" 2>/dev/null | LC_ALL=C sort > "$cur"; then
    ok=$((ok + 1))
    if ! cmp -s "$prev" "$cur"; then
      now="$(ts)"
      if [ "$first" = 1 ]; then
        printf '%s baseline %s rows\n' "$now" "$(wc -l < "$cur")" >> "$OUT"; first=0
      else
        LC_ALL=C comm -13 "$prev" "$cur" | sed "s/^/$now + /" >> "$OUT"
        LC_ALL=C comm -23 "$prev" "$cur" | sed "s/^/$now - /" >> "$OUT"
      fi
      cp "$cur" "$prev"
    fi
  else
    fail=$((fail + 1))
  fi
  # Liveness marker every ~5 min at the default interval, so a log that goes
  # quiet can be told from a sampler that died.
  if [ $(( (ok + fail) % 600 )) = 0 ]; then
    printf '%s alive ok=%s busy=%s\n' "$(ts)" "$ok" "$fail" >> "$OUT"
  fi
  sleep "$IV"
done
