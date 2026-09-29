#!/usr/bin/env bash
# Fail when an Allium spec refers to something that is not declared anywhere.
#
# `allium check` proves SYNTAX, not reference integrity. CLAUDE.md
# (§ Specification Pattern) records this, verified twice independently against
# allium 3.2.3 and re-confirmed against 3.6.1: appending an invariant that reads
# a field which does not exist, or one that iterates an entity type never
# declared, leaves `check` at 0 errors with the warning and info counters
# completely unmoved. A green `allium check` means the file parses. It does not
# mean the file refers to anything that exists.
#
# This closes that gap for five reference kinds. The work is in
# tools/allium-refcheck/refcheck.py, over `allium parse` JSON -- the same AST
# the compiler builds, so no check here guesses from text. Read that file's
# docstring for what each check does and, more importantly, what none of them
# do.
#
# WHY NOT THE LANGUAGE SERVER
# ---------------------------
# It was evaluated for exactly this job and rejected. Thirteen of its errors
# were confirmed FALSE against both the file text and `allium parse` --
# "CacheHit must define a when: trigger" where the `when:` is present, an import
# alias reported unrecognised where `use "./crm.allium" as crm` is declared
# (docs/BUGS.md, commit f05e2d9b). It also only reports on files it is editing,
# so it cannot sweep 38 specs. A gate that cries wolf gets switched off, so this
# one is written to stay silent wherever it cannot be sure, and every place it
# deliberately declines to guess is named in the tool's docstring.
#
# WHAT A GREEN RUN DOES NOT PROVE
# -------------------------------
# It checks REFERENCES, NOT TRUTH. An invariant naming real entities and real
# fields can still assert something the implementation does not do. That is
# spec/code drift and the tool for it is `allium:weed`. Green here means every
# name resolves -- nothing about whether the claims are correct, and nothing
# about the specs being complete.
#
# EXIT CODES -- three outcomes, deliberately distinguishable
#   0  no unresolved references. Acknowledged findings may still be printed.
#   1  unresolved references found; each named as file:line with its source line.
#   2  COULD NOT RUN (allium or python3 missing, or a spec failed to parse).
#      NOT the same as 0. The sibling scripts/check-e2e-residue.sh treats an
#      unmet precondition as exit 0, because a missing run database genuinely
#      means "nothing to judge". Here the preconditions are the checker itself:
#      if allium is absent, nothing was examined, and reporting that as success
#      is how a gate silently stops gating. A CI step can branch on 2.
#
# ACKNOWLEDGED FINDINGS
# ---------------------
# A real, known, deliberately-deferred gap is recorded as an `open question` in
# the SAME spec file naming both the surface (or invariant) and the target. The
# checker reads those and prints such findings without failing the run -- the
# KNOWN_DEBT convention of check-e2e-residue.sh ("not permission, debt with a
# number"), except the acknowledgement lives next to the thing it excuses, so
# deleting the open question re-arms the gate and no second list can rot.
# Seven findings in this tree are acknowledged today; they are printed on every
# run and are not a pass.
#
# Invoke via:
#   bash scripts/check-spec-refs.sh
#   bun run check:spec-refs
#   bash scripts/check-spec-refs.sh --self-test   # prove the checks can fire
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

CHECKER="tools/allium-refcheck/refcheck.py"
SPECS="${SPEC_DIR:-specs}"

rc=0
# Always last, in every path including the degraded ones. `set -e` is
# deliberately NOT set: an early return must still reach this line.
trap 'echo "[check-spec-refs] EXIT=$rc"' EXIT

die() { echo "[check-spec-refs] CANNOT RUN — $1" >&2; rc=2; exit 2; }

command -v python3 >/dev/null 2>&1 || die "python3 is not on PATH."
command -v allium  >/dev/null 2>&1 || die \
  "\`allium\` is not on PATH, so no spec was parsed and NOTHING was checked.
                          This is not a clean run — exit 2 says so, distinctly from exit 0."
[ -f "$CHECKER" ] || die "$CHECKER is missing."
[ -d "$SPECS" ]   || die "no spec directory at $SPECS (override with SPEC_DIR=)."

python3 "$CHECKER" --specs "$SPECS" "$@"
rc=$?

case "$rc" in
  0) : ;;   # the checker printed its own summary line
  1) : ;;   # the checker printed each finding as file:line + its source line
  2) echo "[check-spec-refs] a spec could not be parsed — the result above is incomplete." >&2 ;;
  *) echo "[check-spec-refs] unexpected checker status $rc." >&2 ;;
esac

exit "$rc"
