#!/usr/bin/env bash
# Shared guardrails for the heavy wrappers. SOURCE this, do not execute it.
#
# Both functions exist because of concrete incidents, not theory:
#
#   guard_host_load — on 2026-09-01 a Playwright run was started while six
#   subagents were still resident. Load average reached 69.81 and the suite
#   produced 11 failures with durations like 14.9 minutes for a single test.
#   Those numbers measured contention, not the tree, and half an hour went into
#   reading them as test results. A run on a loaded host is worse than no run:
#   it costs the time AND produces a number you may believe.
#
#   report_exit — `cmd; echo "EXIT=$?"` reports the status of the LAST command
#   in the pipeline, so a wrapper piped into `tail` reports success no matter
#   what happened. That trap fired four times in one session. Every wrapper now
#   prints its own status as the final line of its own output, where no
#   pipeline can rewrite it.

# Refuse (or warn about) starting heavy work on an already-busy host.
# Usage: guard_host_load "<label>"   -> returns non-zero if the caller should stop.
# Tunables: GUARD_LOAD_WARN (default 2.0 per core), GUARD_LOAD_ABORT (4.0),
#           ALLOW_BUSY_HOST=1 to proceed anyway.
guard_host_load() {
  local label="${1:-run}" cores load ratio warn abort
  cores="$(nproc 2>/dev/null || echo 1)"
  load="$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)"
  ratio="$(awk -v l="$load" -v c="$cores" 'BEGIN{printf "%.2f", (c>0 ? l/c : l)}')"
  warn="${GUARD_LOAD_WARN:-2.0}"
  abort="${GUARD_LOAD_ABORT:-4.0}"

  if awk -v r="$ratio" -v a="$abort" 'BEGIN{exit !(r+0 >= a+0)}'; then
    echo "[$label] host load ${load} over ${cores} cores = ${ratio}x per core."
    echo "[$label] Top consumers right now:"
    ps -eo pcpu,rss,cmd --sort=-pcpu --no-headers 2>/dev/null | head -5 |
      sed 's/^/           /' | cut -c1-110
    if [ "${ALLOW_BUSY_HOST:-}" = "1" ]; then
      echo "[$label] ALLOW_BUSY_HOST=1 — proceeding anyway. Treat the results as suspect."
      return 0
    fi
    echo "[$label] ABORT: this host is too busy for a meaningful run."
    echo "           Numbers produced now would measure contention, not the code."
    echo "           Stop what is competing (subagents count!), then re-run."
    echo "           Override with ALLOW_BUSY_HOST=1 if you know what you are doing."
    return 1
  fi

  if awk -v r="$ratio" -v w="$warn" 'BEGIN{exit !(r+0 >= w+0)}'; then
    echo "[$label] WARNING: load ${load} over ${cores} cores = ${ratio}x per core."
    echo "           Timings will be inflated; a failure here may be contention."
  fi
  return 0
}

# Final, pipeline-proof status line. Usage: report_exit "<label>" "$rc" ["<timeout-s>"]
report_exit() {
  local label="${1:-run}" rc="${2:-0}" tmo="${3:-}"
  echo
  echo "[$label] EXIT=${rc}"
  if [ "$rc" = "124" ]; then
    echo "[$label] TIMED OUT${tmo:+ after ${tmo}s} — this is NOT a failure of the thing under test."
    echo "           It was killed before it could finish, so nothing is proven either way."
    echo "           Check the host first:  uptime && nproc"
    echo "           Raise the budget only once you know why it was slow."
  fi
  return 0
}
