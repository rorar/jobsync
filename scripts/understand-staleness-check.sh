#!/usr/bin/env bash
#
# understand-staleness-check.sh — knowledge-graph freshness signal.
#
# The Understand-Anything graph (.understand-anything/) is LLM-generated and only
# auto-updates for commits made INSIDE a Claude Code session. External edits,
# `git pull`, and branch/worktree switches silently invalidate it. This script
# compares the graph's build commit (meta.json.gitCommitHash) against HEAD and
# lists the files changed since — the set of graph nodes that must NOT be trusted.
#
# Pure shell, no LLM, no jq dependency. Always exits 0 (informational only — it is
# a SessionStart reminder / a feed-time stamp, never a gate that blocks work).
#
# Output is consumed by the FEEDING RULE in CLAUDE.md: whoever primes a subagent
# with graph content must run this first and pass the verdict + stale-file list
# into the subagent's context.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "${ROOT}" ]; then
  echo "[understand-graph] not a git repo — skipping staleness check."
  exit 0
fi

META="${ROOT}/.understand-anything/meta.json"
TAG="[understand-graph]"

if [ ! -f "${META}" ]; then
  echo "${TAG} ABSENT — no knowledge graph at .understand-anything/. Navigate by grep/Read; run /understand-anything:understand to build one."
  exit 0
fi

# Extract gitCommitHash without requiring jq.
GRAPH_SHA="$(grep -oE '"gitCommitHash"[[:space:]]*:[[:space:]]*"[0-9a-fA-F]+"' "${META}" 2>/dev/null | grep -oE '[0-9a-fA-F]{7,40}' | head -1 || true)"
HEAD_SHA="$(git -C "${ROOT}" rev-parse HEAD 2>/dev/null || true)"

if [ -z "${GRAPH_SHA}" ] || [ -z "${HEAD_SHA}" ]; then
  echo "${TAG} could not determine graph/HEAD commit — treat the WHOLE graph as suspect; verify against current code."
  exit 0
fi

SHORT_G="${GRAPH_SHA:0:8}"
SHORT_H="${HEAD_SHA:0:8}"

if [ "${GRAPH_SHA}" = "${HEAD_SHA}" ]; then
  echo "${TAG} FRESH — graph @ ${SHORT_G} == HEAD. Still a hypothesis (LLM-generated): verify findings against code."
  exit 0
fi

# HEAD differs. Is the graph's commit even in current history? (rebase / branch switch)
if ! git -C "${ROOT}" cat-file -e "${GRAPH_SHA}^{commit}" 2>/dev/null; then
  echo "${TAG} STALE — graph @ ${SHORT_G} is NOT in current history (rebase / branch / worktree switch?). Treat the ENTIRE graph as suspect; navigate by grep and refresh with /understand-anything:understand."
  exit 0
fi

COUNT="$(git -C "${ROOT}" rev-list --count "${GRAPH_SHA}..${HEAD_SHA}" 2>/dev/null || echo "?")"
echo "${TAG} STALE — graph @ ${SHORT_G}, HEAD @ ${SHORT_H} (${COUNT} commits behind)."
echo "${TAG} UNTRUSTED nodes (files changed since the graph was built):"

CHANGED="$(git -C "${ROOT}" diff --name-only "${GRAPH_SHA}" "${HEAD_SHA}" 2>/dev/null || true)"
if [ -z "${CHANGED}" ]; then
  echo "  (could not compute the file delta — treat all code-touching nodes as suspect)"
else
  echo "${CHANGED}" | sed 's/^/  /'
fi

echo "${TAG} → Graph = hypothesis. For the files above, grep/Read the CURRENT code before trusting any node/edge/summary; or run /understand-anything:understand to refresh. allium:weed remains authoritative for spec↔code drift."
exit 0
