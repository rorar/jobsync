#!/usr/bin/env bash
# Run Jest tests using system Node.js (not bun — avoids readonly property bug).
#
# VM resource guard: jobsync runs on an 8GB NixOS VM and has been trashed in
# the past when Jest used its default worker count (num_cpus - 1). This
# wrapper defends the VM in two ways:
#
#   1. Translates the common typo `--workers=N` to `--maxWorkers=N`. Jest's
#      actual flag is `--maxWorkers`; `--workers` is silently ignored, which
#      for months masked the fact that tests were running at the Jest default
#      worker count even when the caller thought they were limited to 1.
#   2. Defaults to `--maxWorkers=1` when the caller does not specify any
#      worker-related flag, giving a safe baseline regardless of caller
#      awareness.
#
# `jest.config.ts` also enforces `maxWorkers: 1` at the config level as a
# second line of defense for raw `npx jest` invocations that bypass this
# script (e.g., agents using the Bash tool directly). Override by setting
# the `JEST_MAX_WORKERS` env var at the config level or by passing an
# explicit `--maxWorkers=N` / `-w N` flag through this wrapper.
source "$(dirname "$0")/env.sh"
export PATH="/run/current-system/sw/bin:$PATH"

echo "[test.sh] Using Node.js $(node --version)"

ARGS=()
HAS_WORKERS_FLAG=false
HAS_COVERAGE_FLAG=false
for arg in "$@"; do
  case "$arg" in
    --workers=*)
      translated="--maxWorkers=${arg#--workers=}"
      echo "[test.sh] NOTE: --workers is not a Jest flag; translating '$arg' -> '$translated'"
      ARGS+=("$translated")
      HAS_WORKERS_FLAG=true
      ;;
    --workers)
      # Bare `--workers N` — consume the next arg too
      echo "[test.sh] ERROR: bare '--workers' flag is ambiguous; use --workers=N or --maxWorkers=N"
      exit 2
      ;;
    -w|--maxWorkers|--maxWorkers=*)
      ARGS+=("$arg")
      HAS_WORKERS_FLAG=true
      ;;
    --coverage)
      # Opt-IN flag: pass --coverage to Jest, which overrides collectCoverage:false
      # in jest.config.ts for this run only. Without this flag, coverage is skipped
      # (the fast default). See H-P-03 and CLAUDE.md § Testing Requirements.
      ARGS+=("$arg")
      HAS_COVERAGE_FLAG=true
      ;;
    *)
      ARGS+=("$arg")
      ;;
  esac
done

if [[ "$HAS_WORKERS_FLAG" == "false" ]]; then
  echo "[test.sh] No worker flag supplied; defaulting to --maxWorkers=1 (VM resource guard)"
  ARGS=("--maxWorkers=1" "${ARGS[@]}")
fi

if [[ "$HAS_COVERAGE_FLAG" == "false" ]]; then
  echo "[test.sh] No --coverage flag supplied; running without coverage (fast default, see H-P-03)"
fi

exec npx jest "${ARGS[@]}"
