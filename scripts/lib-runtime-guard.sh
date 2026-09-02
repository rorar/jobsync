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

# Refuse (or warn about) starting heavy work when THIS container is already busy.
#
# It deliberately does NOT use /proc/loadavg. This project runs in an LXC
# container, and loadavg is not namespaced: it reports the whole HOST's load,
# while nproc reports our CPU affinity. Dividing one by the other compares
# unrelated numbers. The first version of this guard did exactly that and
# blocked a legitimate run at "5.37 over 3 cores" while this cgroup was using
# 0.04 cores and the host was at ~20% — the same defect class it was written to
# catch, pointing the other way.
#
# cgroup v2 cpu.stat gives the honest signal: how much CPU WE are actually
# using. That is also the right scope, because what flattened this host was our
# own six subagents plus a Playwright run, all inside this cgroup.
#
# Known limitation, stated rather than hidden: this cannot see contention from
# OTHER containers on the same host. If a run is inexplicably slow while this
# guard is quiet, look outside the container.
#
# The thresholds are fractions of the allowance, and they are deliberately WELL
# BELOW 1.0. The sample is taken BEFORE the heavy work starts, so it measures
# what is ALREADY running — resident subagents, a forgotten dev server, another
# suite. Usage cannot exceed the allowance (that is what an allowance is), so a
# threshold at or above 1.0 can never fire: the first version aborted at 1.20
# and was therefore unreachable, a guard that looked like it protected and could
# not. 0.60 means "more than half this container is spoken for before I begin",
# which is the situation that produced 14-minute unit tests.
#
# Usage: guard_host_load "<label>"  -> non-zero means the caller should stop.
# Tunables: GUARD_CPU_WARN (0.35), GUARD_CPU_ABORT (0.60), GUARD_SAMPLE_SECS (1),
#           ALLOW_BUSY_HOST=1 to proceed anyway.
guard_host_load() {
  local label="${1:-run}" allowance busy ratio warn abort a b secs quota period

  # effective CPU allowance: cgroup quota if one is set, else our affinity
  allowance="$(nproc 2>/dev/null || echo 1)"
  if [ -r /sys/fs/cgroup/cpu.max ]; then
    read -r quota period < /sys/fs/cgroup/cpu.max
    if [ "$quota" != "max" ] && [ -n "$period" ] && [ "$period" -gt 0 ] 2>/dev/null; then
      allowance="$(awk -v q="$quota" -v p="$period" 'BEGIN{printf "%.2f", q/p}')"
    fi
  fi

  secs="${GUARD_SAMPLE_SECS:-1}"
  if [ -r /sys/fs/cgroup/cpu.stat ]; then
    a="$(awk '/^usage_usec/{print $2}' /sys/fs/cgroup/cpu.stat)"
    sleep "$secs"
    b="$(awk '/^usage_usec/{print $2}' /sys/fs/cgroup/cpu.stat)"
    busy="$(awk -v a="$a" -v b="$b" -v s="$secs" 'BEGIN{printf "%.2f", (b-a)/(s*1000000)}')"
  else
    # bare metal without cgroup v2: loadavg IS ours, so it is usable here
    busy="$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)"
  fi

  ratio="$(awk -v b="$busy" -v c="$allowance" 'BEGIN{printf "%.2f", (c>0 ? b/c : b)}')"
  warn="${GUARD_CPU_WARN:-0.35}"
  abort="${GUARD_CPU_ABORT:-0.60}"

  if awk -v r="$ratio" -v a="$abort" 'BEGIN{exit !(r+0 >= a+0)}'; then
    echo "[$label] this container is using ${busy} of ${allowance} allowed cores (${ratio}x)."
    echo "[$label] Top consumers right now:"
    ps -eo pcpu,rss,cmd --sort=-pcpu --no-headers 2>/dev/null | head -5 |
      sed 's/^/           /' | cut -c1-110
    if [ "${ALLOW_BUSY_HOST:-}" = "1" ]; then
      echo "[$label] ALLOW_BUSY_HOST=1 - proceeding. Treat the results as suspect."
      return 0
    fi
    echo "[$label] ABORT: too busy for a meaningful run."
    echo "           Numbers produced now would measure contention, not the code."
    echo "           Stop what is competing (subagents count!), then re-run."
    echo "           Override with ALLOW_BUSY_HOST=1 if you know what you are doing."
    return 1
  fi

  if awk -v r="$ratio" -v w="$warn" 'BEGIN{exit !(r+0 >= w+0)}'; then
    echo "[$label] WARNING: container using ${busy} of ${allowance} cores (${ratio}x)."
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
