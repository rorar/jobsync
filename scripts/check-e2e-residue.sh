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
#     UNCHANGED, so counting alone cannot see it. Found here by ATTACHing the
#     template and asking which rows that came FROM it were written after this
#     run was provisioned. Verified against a seeded StagedVacancy.
#
# AND THE EXAMPLE THAT MOTIVATED THE UPDATE HALF IS NOT COVERED BY IT.
# `deactivateModule` upserts onto a ModuleRegistration row the health monitor
# created (src/actions/module.actions.ts:348), and that is exactly the shape a
# count misses — but neither prisma/seed.ts nor seed-e2e.ts creates a
# ModuleRegistration row, so the template holds NONE, and the `EXISTS (… FROM
# tmpl …)` filter below excludes every one of them. The model is in
# ALLOWED_MUTATION as well, but removing it would change nothing: the query
# cannot reach those rows either way. Stated here rather than left for someone
# to discover, because the header of a check claiming coverage it does not have
# is worse than no header. Closing it means seeding module state into the
# template so the rows exist to be compared.
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

# Debt, not permission.
#
# These models leak TODAY, from specs the 2026-09-02 audit already recorded
# (E2E-B24, E2E-B25). A gate that is red from its first day gets switched off, so
# they do not fail the run — but they are NOT in ALLOWED_GROWTH either, because
# nothing about them is by design. Every run prints them as outstanding debt with
# the finding that owns them, and the entry is deleted when the finding is.
#
# The distinction matters: ALLOWED_GROWTH says "this is not a leak";
# KNOWN_DEBT says "this is a leak we have not fixed yet, and here is its number".
#
# WHAT THIS MAPPING CANNOT DO, stated because its output has already been read
# as more than it is. The key is a MODEL, not a spec. When a JobTitle row
# survives a run, this gate knows the model and prints the finding id filed
# against that model -- it does NOT know which spec wrote the row, and it has
# no way to find out. So the id is a POINTER TO A FINDING, never an
# attribution of blame to a test file.
#
# Measured 2026-09-05, which is why this paragraph exists: the run reported
# JobTitle +15 / Company +15 / Location +13 against E2E-B25, whose subject is
# keyboard-ux.spec.ts. Querying the kept run database showed keyboard-ux had
# left ZERO rows -- every one of them belonged to job-crud, job-detail-panels,
# job-status-crud, contact-company-link, profile-crud, automation-crud or
# question-crud. The gate was right about the leak and wrong about the owner,
# and the wrong owner was acted on. To find the real one, read the row names
# out of `prisma/.e2e-run.db` and match their prefixes against the specs.
KNOWN_DEBT=(
  # Still leaking, measured over four consecutive full runs on 2026-09-07/08
  # (two production, two dev). The counts move by one or two between runs; the
  # presence does not.
  # Re-pointed 2026-09-08 from E2E-B25 to E2E-B38, by reading the row NAMES out
  # of the kept run database instead of inferring the owner from the model. The
  # rows are `E2E Resume <uid>` / `E2E Job <uid>` / `E2E Company <uid>` /
  # `E2E Location <uid>` plus the unprefixed `Software Developer` and
  # `Senior Engineer`; NOT one `KBTest`/`KBRapid`/`KBMobile`, which is what
  # E2E-B25 is about. The five Resumes carry the same five uids as the five
  # leaked Automations, because an automation that survives keeps its resume
  # undeletable — automation-crud says so in its own warning.
  "Resume:E2E-B38"     # +5, automation-crud, one per surviving automation
  "JobTitle:E2E-B38"   # +3: job-crud's `E2E Job <uid>`, profile-crud's two unprefixed
  "Company:E2E-B38"    # +1, job-crud, same uid as its JobTitle
  "Location:E2E-B38"   # +1, job-crud, same uid
  "ActivityType:E2E-B24"  # +1 every run; no admin tab exists for it, so the
                          #   afterEach sweep that fixed Activity cannot reach it
  "Person:E2E-B22"     # +4 — structural: no deletePerson exists, by GDPR design
  "Referral:E2E-B23"   # +1 — structural, same shape as Person
  "Automation:E2E-B38" # +5
  "JobSource:E2E-B38"  # +1 — the row is `Manual`, the tenth against nine seeded
                       #   (prisma/seed.ts), not the "Indeed" this comment used to name
  "Job:E2E-B38"        # inline delete, so it leaks only when a test FAILS first:
                       #   +1 in the one run of the four that had a failure, 0 in
                       #   the other three. Kept for that reason.
)

# REMOVED 2026-09-08, and the removal is the point of the entry rather than
# tidying: while a model sits in this array the gate PRINTS it and carries on, so
# a regression in a model that has actually been fixed would be classified as
# known debt instead of failing the run. E2E-B24 said exactly that and nobody had
# acted on it.
#
# Each of these measured ZERO across the same four consecutive full runs, and
# each has a cleanup path that runs on the failing path too (an `afterEach` net,
# not an inline delete), which is why the zero is expected to hold:
#
#   Tag            keyboard-ux sweeps it via ADMIN_TAB.tag
#   Task           task-crud's afterEach purge
#   Activity       activity-crud's afterEach purge
#   ResumeSection  profile-crud deletes the resume; the cascade in
#   ContactInfo      deleteResumeById's transaction takes its children
#   Summary
#   WorkExperience
#   Education
#   JobStatus      job-status-crud's cleanup, zero in four runs incl. the failing one
#
# If one of them comes back, the gate now fails and names it — which is the whole
# difference between a measured fix and an enforced one.

# WHERE THESE ENTRIES CAME FROM — the split is itself a finding.
#
# Three groups, in array order. Read the boundaries by NAME; the counts are only
# a recount aid and go stale the moment a fixed entry is deleted:
#
#   Resume … Referral          the 2026-09-02 audit, i.e. a document   (7 today)
#   Task, Activity, ActivityType   THIS GATE, on two rewritten specs   (3 today)
#   ResumeSection … Job        THIS GATE, on its first full run        (9 today)
#
# Twelve of the nineteen therefore came from the gate, not from the audit that
# was supposed to have catalogued them — and every one of the last nine already
# sat, at the same counts, in a full-run measurement taken the day before the
# list was written. That is the finding recorded as E2E-B38: the list was seeded
# from a document when a measurement of the same thing already existed on disk,
# and the document was the less complete of the two.
#
# The sentence this replaces said "nine above ResumeSection, ten below". Both
# numbers were wrong on the day they were written (85efc2fd), and the shape was
# wrong too — it described two groups where there are three. Recounted against
# the array on 2026-09-04.
#
# The middle three leaked before this gate existed as well. The between-runs
# purge that ADR-045 deleted (its steps 2, 3 and 12) removed them at the START of
# the next run, so no run ever ENDED visibly dirty and nothing surfaced them.
# Deleting that purge did not create the leak; it stopped hiding it. That is the
# gate earning its place on its first day of real use.

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
debt_seen=""

for t in $TABLES; do
  tmpl="$(sqlite3 "$E2E_TEMPLATE_DB" "SELECT count(*) FROM \"$t\";" 2>/dev/null)"
  run="$(sqlite3 "$E2E_RUN_DB" "SELECT count(*) FROM \"$t\";" 2>/dev/null)"
  [ -z "$tmpl" ] || [ -z "$run" ] && continue
  delta=$(( run - tmpl ))

  if [ "$delta" -gt 0 ]; then
    debt_id=""
    for entry in "${KNOWN_DEBT[@]}"; do
      [ "${entry%%:*}" = "$t" ] && debt_id="${entry#*:}"
    done
    if in_list "$t" "${ALLOWED_GROWTH[@]}"; then
      allowed_seen="$allowed_seen  $t +$delta\n"
    elif [ -n "$debt_id" ]; then
      debt_seen="$debt_seen  $t +$delta  ($debt_id, unfixed)\n"
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
  echo "[residue] OK — no NEW unowned rows and no modified seed data."
  [ -n "$allowed_seen" ] && printf "[residue] allowed, for the record:\n%b" "$allowed_seen"
  [ -n "$debt_seen" ] && {
    printf "[residue] OUTSTANDING DEBT — leaks with a finding, not permission:\n%b" "$debt_seen"
    echo "[residue]   the id names the FINDING filed against that model, NOT the spec that wrote"
    echo "[residue]   the row. This gate cannot tell them apart. Read the names out of the run"
    echo "[residue]   database before acting on an attribution."
  }
  exit 0
fi

[ -n "$debt_seen" ] && printf "[residue] outstanding debt (not the failure below):\n%b" "$debt_seen"
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
