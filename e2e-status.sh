#!/usr/bin/env bash
# One-shot E2E run status. No arguments. Cheap: reads a log and /proc, nothing else.
LOG=/tmp/e2e-verify-2.log
[ -f "$LOG" ] || { echo "no run log yet"; exit 0; }

total=$(grep -oE "Running [0-9]+ tests" "$LOG" | grep -oE "[0-9]+" | head -1)
pass=$(grep -c "✓" "$LOG")
fail=$(grep -c "✘" "$LOG")
done=$((pass + fail))
if pgrep -f "playwright test --project=crud" >/dev/null; then state="RUNNING"; else state="FINISHED"; fi

printf "%s  %s/%s done  ·  %s passed  ·  %s failed\n" \
  "$state" "$done" "${total:-?}" "$pass" "$fail"

last=$(grep -E "✓|✘" "$LOG" | tail -1 | sed 's/^ *//')
[ -n "$last" ] && echo "last: ${last:0:150}"

if [ "$fail" -gt 0 ]; then
  echo "--- failures by spec ---"
  grep "✘" "$LOG" | grep -oE "e2e/[a-z]+/[a-z0-9-]+\.spec\.ts" | sort | uniq -c | sort -rn
fi
