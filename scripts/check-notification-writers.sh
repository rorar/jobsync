#!/usr/bin/env bash
# Enforces the "no direct prisma.notification.create" invariant from ADR-030
# and specs/notification-dispatch.allium (invariant SingleNotificationWriter).
#
# Direct writes are permitted ONLY in the allowed files below. Every entry is a
# legacy exception that should eventually route through the channel router via
# domain events.
#
# This check should run in pre-commit and/or CI. Invoke via:
#   bash scripts/check-notification-writers.sh
#   bun run check:notification-writers

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Files permitted to call prisma.notification.create* directly.
# Keep this list tight — every new entry is a temporary exception that
# should eventually route through the dispatcher.
ALLOWED_FILES=(
  # The in-app channel implementation itself is the legitimate writer.
  "src/lib/notifications/channels/in-app.channel.ts"
  # Legacy legitimate exceptions patched to satisfy LateBoundLocale
  # (ADR-030). Stream 2 of the next sprint will refactor these to
  # event emission, after which they should be removed from this list.
  "src/lib/connector/degradation.ts"
  "src/lib/notifications/channels/webhook.channel.ts"
  # Additional legacy writer surfaced by the stream-4 grep enforcement
  # (not originally listed in ADR-030). Also patched pending the
  # event-emission refactor. TODO: add to ADR-030 legacy list or
  # refactor to event emission as part of Stream 2.
  "src/actions/module.actions.ts"
)

# Grep for the offending patterns across src/
violations=$(grep -rn -E "prisma\.notification\.(create|createMany)" src/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null || true)

if [[ -z "$violations" ]]; then
  echo "OK: No direct notification writers found"
  exit 0
fi

# Filter out allowed files and comment-only matches.
filtered=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  file="${line%%:*}"
  # Extract the matched source text after "file:lineno:"
  rest="${line#*:}"
  code="${rest#*:}"
  # Skip lines that are pure comments (/* ... */, //, *).
  trimmed="${code#"${code%%[![:space:]]*}"}"
  case "$trimmed" in
    \**|//*|\/\**) continue ;;
  esac
  allowed=false
  for allowed_file in "${ALLOWED_FILES[@]}"; do
    if [[ "$file" == "$allowed_file" ]]; then
      allowed=true
      break
    fi
  done
  if [[ "$allowed" == "false" ]]; then
    filtered+="$line"$'\n'
  fi
done <<< "$violations"

# Strip trailing newline for empty check
filtered="${filtered%$'\n'}"

if [[ -z "$filtered" ]]; then
  echo "OK: All direct notification writers are in allowed files"
  exit 0
fi

echo "FAIL: Direct prisma.notification.create* found outside allowed files:"
echo "$filtered"
echo ""
echo "See ADR-030 / specs/notification-dispatch.allium (SingleNotificationWriter)."
echo "Allowed files:"
printf '  - %s\n' "${ALLOWED_FILES[@]}"
exit 1
