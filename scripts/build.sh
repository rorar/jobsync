#!/usr/bin/env bash
# Production build
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/env.sh"
source "$DIR/lib-devserver.sh"

# Free the port for this worktree only.
#
# The line this replaces was `pkill -f "next dev"`, which matches a command line
# every checkout on the machine produces and therefore killed sibling worktrees'
# servers. CLAUDE.md records that pattern as already replaced by devserver_stop;
# it survived here because build-safe.sh does its own (correctly scoped) stop
# first, so the blind kill only ever ran with nothing left to hit — in the one
# path anybody uses. Running build.sh directly still had the old reach.
#
# It also matched only `next dev`, which stopped being the whole story when
# scripts/prod-e2e.sh started running `next start` on the same port.
devserver_stop "$(devserver_port)"
exec bun run build
