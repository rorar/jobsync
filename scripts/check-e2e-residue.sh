#!/usr/bin/env bash
# Fail when an E2E run left rows behind that nothing owns.
#
# Implements `SettledTestCaseOwnsNoLeakedRow` in
# specs/e2e-test-infrastructure.allium, which has existed as prose since
# 2026-09-02 and has had no enforcement: its only implementations are two
# per-file afterEach detectors that `console.warn` and never fail
# (e2e/crud/settings-api-keys.spec.ts, e2e/crud/webhook-settings.spec.ts).
#
# WHY THIS EXISTS RATHER THAN A FIXTURE REWRITE
# --------------------------------------------
# The alternative was routing all 26 spec files through Playwright factory
# fixtures. Measured against one full run, that buys a property most models
# already have, at the cost of touching 77 tests. This gate enforces the
# property instead, and catches the next spec that breaks it — which is what the
# rewrite was actually for.
#
# The premise it was first argued from turned out to be wrong, and that is worth
# recording here rather than in a commit nobody re-reads: the models that ended
# at zero residue did so because the run was GREEN, not because those specs own
# their rows. smtp-settings, settings-blacklist and question-crud clean up
# INLINE at the end of the test body — the path a failed assertion skips.
# Measured 2026-09-02: one injected failing assertion before the inline delete
# leaves SmtpConfig at 1, an active per-user singleton (E2E-B37).
#
# TWO SHAPES, ONLY ONE OF WHICH A COUNT CAN SEE
# ---------------------------------------------
#   INSERT residue — a row created and not deleted. A count delta finds it.
#   UPDATE residue — an existing row mutated and not restored. The count is
#     UNCHANGED. `deactivateModule` upserts onto a row the health monitor has
#     already created (src/actions/module.actions.ts:346-352), so a deactivated
#     module is invisible to counting; automation-wizard-modules.spec.ts:27-28
#     documents that later tests see the result.
# So this checks both: counts for the first, `updatedAt` against the run's own
# provisioning timestamp for the second.
#
# Its blind spot, stated rather than discovered later: `Profile` has no
# `updatedAt` column, so a mutation of a seeded Profile row is invisible to both
# halves. `Job`, `Company`, `JobTitle` and `Location` have none either.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.."
source "$DIR/e2e-db.sh"

# ---------------------------------------------------------------------------
# Allowlists. Every entry carries its reason; an allowlist that does not say why
# decays into "things we gave up on".
# ---------------------------------------------------------------------------

# Rows these models gain are not leaks. Membership only, deliberately no
# budgets: AdminAuditLog is written on every job create/update/delete and every
# Person PII read (src/lib/audit/data-audit.ts:77) fire-and-forget, the CRM cron
# writes every 15 minutes, and the dev server keeps running after the suite
# exits — so any number here would measure wall clock, not ownership.
ALLOWED_GROWTH=(
  "AdminAuditLog"       # append-only audit trail; every admin action and PII read
  "EnrichmentLog"       # append-only attempt log, one row per module per chain
  "CrmActivityLog"      # append-only timeline projection
  "Notification"        # dispatched notifications, an outcome of the run
  "EnrichmentResult"    # enrichment cache, keyed and TTL'd, not owned by a test
  "ModuleRegistration"  # created by the health monitor for every module, not by a test
  "JobStatusHistory"    # append-only history of status transitions
  "_e2e_meta"           # written by e2e_db_provision_run, not by a test
)

# Seeded rows these models are allowed to have modified. Keep this list short
# and hostile: every entry is a place where a test changed shared state and
# nothing restored it.
ALLOWED_MUTATION=(
  "ModuleRegistration"  # the health monitor writes healthStatus on every probe
  "UserSettings"        # seeded singleton the settings specs legitimately drive
)

# ---------------------------------------------------------------------------
# Preconditions. A gate that cannot run says so; it never passes silently.
# ---------------------------------------------------------------------------
skip() { echo "[residue] SKIPPED — $1"; exit 0; }

command -v sqlite3 >/dev/null 2>&1 || skip "sqlite3 is not installed."
[ -f "$E2E_RUN_DB" ]      || skip "no run database at $E2E_RUN_DB (was E2E_KEEP_RUN_DB=0, or no run yet?)"
[ -f "$E2E_TEMPLATE_DB" ] || skip "no template at $E2E_TEMPLATE_DB"

PROVISIONED_AT="$(sqlite3 "$E2E_RUN_DB" \
  "SELECT value FROM _e2e_meta WHERE key='provisioned_at_ms';" 2>/dev/null)"
RUN_STAMP="$(sqlite3 "$E2E_RUN_DB" \
  "SELECT value FROM _e2e_meta WHERE key='template_stamp';" 2>/dev/null)"

[ -n "$PROVISIONED_AT" ] || skip "the run database carries no provenance — it predates this check, or provisioning was skipped (E2E_REUSE_SERVER=1)."

# The run database says which template it came from. If the template has been
# rebuilt since, the diff below would compare against a baseline this run never
# saw and report something plausible.
CURRENT_STAMP="$(_e2e_db_stamp)"
if [ "$RUN_STAMP" != "$CURRENT_STAMP" ]; then
  skip "the template was rebuilt after this run (stamp ${RUN_STAMP:0:12}… vs ${CURRENT_STAMP:0:12}…); nothing to compare against."
fi

# ---------------------------------------------------------------------------
# Measure
# ---------------------------------------------------------------------------
in_list() {
  local needle="$1"; shift
  local item
  for item in "$@"; do [ "$item" = "$needle" ] && return 0; done
  return 1
}

TABLES="$(sqlite3 "$E2E_TEMPLATE_DB" \
  "SELECT name FROM sqlite_master WHERE type='table'
     AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%';")"

growth_violations=""
mutation_violations=""
allowed_seen=""

for t in $TABLES; do
  tmpl="$(sqlite3 "$E2E_TEMPLATE_DB" "SELECT count(*) FROM \"$t\";" 2>/dev/null)"
  run="$(sqlite3 "$E2E_RUN_DB" "SELECT count(*) FROM \"$t\";" 2>/dev/null)"
  [ -z "$tmpl" ] || [ -z "$run" ] && continue
  delta=$(( run - tmpl ))

  if [ "$delta" -gt 0 ]; then
    if in_list "$t" "${ALLOWED_GROWTH[@]}"; then
      allowed_seen="$allowed_seen  $t +$delta\n"
    else
      growth_violations="$growth_violations  $t: template=$tmpl run=$run (+$delta rows left behind)\n"
    fi
  fi

  # UPDATE residue: a row that came from the template and was written after this
  # run was provisioned. ATTACH rather than compare counts — the ids decide
  # which rows are the template's, and a count cannot.
  if sqlite3 "$E2E_TEMPLATE_DB" "PRAGMA table_info(\"$t\");" | grep -q '|updatedAt|'; then
    touched="$(sqlite3 "$E2E_RUN_DB" \
      "ATTACH DATABASE '$E2E_TEMPLATE_DB' AS tmpl;
       SELECT count(*) FROM main.\"$t\" r
         WHERE r.updatedAt > $PROVISIONED_AT
           AND EXISTS (SELECT 1 FROM tmpl.\"$t\" s WHERE s.id = r.id);" 2>/dev/null)"
    if [ -n "$touched" ] && [ "$touched" -gt 0 ]; then
      if in_list "$t" "${ALLOWED_MUTATION[@]}"; then
        allowed_seen="$allowed_seen  $t ~$touched (mutated, allowed)\n"
      else
        mutation_violations="$mutation_violations  $t: $touched seeded row(s) modified and not restored\n"
      fi
    fi
  fi
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [ -z "$growth_violations" ] && [ -z "$mutation_violations" ]; then
  echo "[residue] OK — no unowned rows and no modified seed data."
  [ -n "$allowed_seen" ] && printf "[residue] allowed, for the record:\n%b" "$allowed_seen"
  exit 0
fi

echo "[residue] FAIL — the run left state behind that no test owns:" >&2
[ -n "$growth_violations" ]   && printf "\n rows created and not deleted:\n%b" "$growth_violations" >&2
[ -n "$mutation_violations" ] && printf "\n seed data modified and not restored:\n%b" "$mutation_violations" >&2
cat >&2 <<'TRAILER'

 Invariant: SettledTestCaseOwnsNoLeakedRow, specs/e2e-test-infrastructure.allium
 A test must remove what it created and restore what it changed, on the failing
 path as well as the passing one -- which means a test.afterEach hook, not a
 statement at the end of the test body that a thrown assertion skips.
 See e2e/crud/webhook-settings.spec.ts for the pattern that works.

 If the row genuinely is not a test's to own, add the model to ALLOWED_GROWTH or
 ALLOWED_MUTATION in scripts/check-e2e-residue.sh WITH ITS REASON.
TRAILER
exit 1
