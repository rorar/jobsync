#!/usr/bin/env bash
# Point git at the repo's tracked hooks.
#
# Run deliberately; nothing installs this for you. `core.hooksPath` is a
# per-REPOSITORY setting and this repository is shared with every linked
# worktree — installing here arms the hook for pushes from the main checkout
# and from every worktree, not just this one. That is the intended effect, and
# it is also why the step is not taken silently by a script that happened to be
# doing something else.
#
#   bash scripts/install-hooks.sh            install
#   bash scripts/install-hooks.sh --status   report what is configured
#   bash scripts/install-hooks.sh --uninstall  restore git's default
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

# The tracked directory is addressed relative to the repository, so it resolves
# the same from the main checkout and from any worktree.
HOOKS_REL="scripts/hooks"

current="$(git config --get core.hooksPath || true)"

case "${1:-}" in
  --status)
    echo "core.hooksPath = ${current:-<unset, git uses .git/hooks>}"
    if [ -n "$current" ]; then
      echo "hooks present:"
      ls -1 "$ROOT/$current" 2>/dev/null | sed 's/^/  /' || echo "  (directory missing)"
    fi
    exit 0
    ;;
  --uninstall)
    if [ -z "$current" ]; then
      echo "[install-hooks] core.hooksPath was not set — nothing to undo."
      exit 0
    fi
    git config --unset core.hooksPath
    echo "[install-hooks] removed core.hooksPath (was: $current). Git is back on .git/hooks."
    exit 0
    ;;
  "") ;;
  *)
    echo "[install-hooks] unknown argument: $1" >&2
    exit 2
    ;;
esac

if [ ! -x "$ROOT/$HOOKS_REL/pre-push" ]; then
  chmod +x "$ROOT/$HOOKS_REL"/* 2>/dev/null || true
fi
if [ ! -x "$ROOT/$HOOKS_REL/pre-push" ]; then
  echo "[install-hooks] $HOOKS_REL/pre-push is missing or not executable." >&2
  exit 1
fi

if [ -n "$current" ] && [ "$current" != "$HOOKS_REL" ]; then
  echo "[install-hooks] core.hooksPath is already set to '$current'." >&2
  echo "[install-hooks] Refusing to overwrite someone else's hooks. Unset it first:" >&2
  echo "[install-hooks]   git config --unset core.hooksPath" >&2
  exit 1
fi

git config core.hooksPath "$HOOKS_REL"
echo "[install-hooks] core.hooksPath = $HOOKS_REL"
echo "[install-hooks] armed for THIS repository, which includes every linked worktree."
echo "[install-hooks] pre-push runs: check-spec-refs.sh, check-notification-writers.sh"
echo "[install-hooks] bypass one push with: git push --no-verify"
