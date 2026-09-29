#!/usr/bin/env bash
# Place every dev-server watchdog restart against the test that was running.
#
#   scripts/e2e-attribute-restarts.sh <report.json> <server.log>
#
# Reads the Playwright JSON report (per-result `startTime` + `duration`) and
# the timestamped server log scripts/test-e2e.sh writes, and prints one line
# per `approaching the used memory threshold` occurrence naming the test whose
# window contains it — or the gap it fell into. scripts/test-e2e.sh calls this
# from its restart banner; it is also usable by hand on a kept pair
# (`test-results/.e2e-run-report.json` + `test-results/.e2e-server-dev.log`).
#
# Why a script and not a reader with two files open: the restart leaves NO
# trace on the runner's side (E2E-B42), so a test that failed inside its window
# looks like any other failure, and this repo has misdiagnosed exactly that
# signature twice. Measured 2026-09-07 over four valid full dev runs: the
# restart fell inside `job-detail-panels.spec.ts:440` in all four (it fires
# after ~1,620-1,650 logged requests and the suite order is fixed), and the
# test failed in three of them — with `ERR_CONNECTION_REFUSED`, with a hung
# table load, with "list not visible" — and passed in the one where no
# navigation was in flight at that second. A line here turns that from a
# ten-minute correlation into a glance.
#
# Clock: the server log carries local HH:MM:SS (bash `printf '%(%T)T'`); the
# report carries UTC ISO. Both are reduced to local seconds-of-day, so a run
# that crosses midnight can misattribute a restart on the far side of it.
set -uo pipefail
REPORT="${1:-}"; LOG="${2:-}"
if [ ! -f "$REPORT" ] || [ ! -f "$LOG" ]; then
  echo "[attribute-restarts] need <report.json> <server.log>; got '$REPORT' '$LOG'" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "[attribute-restarts] node not found" >&2
  exit 2
fi
node - "$REPORT" "$LOG" <<'EOF'
const fs = require("fs");
const [report, log] = process.argv.slice(2);
let r;
try { r = JSON.parse(fs.readFileSync(report, "utf8")); }
catch (e) { console.log(`[attribute-restarts] report unreadable: ${e.message}`); process.exit(0); }
const secs = (hms) => { const [h, m, s] = hms.split(":").map(Number); return h * 3600 + m * 60 + s; };
const localHms = (iso, plusMs = 0) => new Date(new Date(iso).getTime() + plusMs).toTimeString().slice(0, 8);
const tests = [];
(function walk(s) {
  for (const sp of s.specs || []) for (const t of sp.tests || []) for (const x of t.results || []) {
    if (!x.startTime) continue;
    const start = localHms(x.startTime), end = localHms(x.startTime, x.duration || 0);
    tests.push({ id: `${sp.file}:${sp.line}`, title: sp.title, status: x.status, start, end, a: secs(start), b: secs(end) });
  }
  for (const c of s.suites || []) walk(c);
})({ suites: r.suites || [] });
tests.sort((p, q) => p.a - q.a);
const restarts = fs.readFileSync(log, "utf8").split("\n")
  .filter((l) => l.includes("approaching the used memory threshold"))
  .map((l) => (l.match(/^(\d\d:\d\d:\d\d)/) || [])[1]).filter(Boolean);
if (restarts.length === 0) { console.log("[attribute-restarts] no restart lines in the server log."); process.exit(0); }
for (const hms of restarts) {
  const t = secs(hms);
  const inside = tests.filter((x) => x.a <= t && t <= x.b);
  if (inside.length) {
    for (const x of inside) console.log(`[attribute-restarts] restart ${hms} fell INSIDE ${x.id} "${x.title}" (${x.start}-${x.end}, ${x.status})`);
  } else {
    const before = tests.filter((x) => x.b < t).pop();
    const after = tests.find((x) => x.a > t);
    console.log(`[attribute-restarts] restart ${hms} fell BETWEEN tests: after ${before ? before.id + " (ended " + before.end + ")" : "none"}, before ${after ? after.id + " (started " + after.start + ")" : "none"}`);
  }
}
EOF
