#!/usr/bin/env bash
# Track 2: JobDeck (C1) — Card-based vacancy review UI
# Swipe/tap to accept/dismiss, keyboard navigation, animations
#
# Usage: bash scripts/tracks/track2-jobdeck.sh [worktree_path]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/track-runner.sh"

WORKTREE="${1:-$(pwd)}"
LOG_FILE="${2:-$WORKTREE/../track2-jobdeck.log}"

PROMPT="$(cat <<'PROMPT'
You are working on Sprint C Track 2 for the JobSync project.
Read CLAUDE.md and the project memories first.

## Context
ROADMAP 0.10 (Scheduler Coordination) + Sprint A + Sprint B are DONE (on main).
You are on a feature branch. All prior work is merged into your branch base.

Read the masterplan at /home/pascal/.claude/plans/open-architecture-masterplan.md for full context.
Read ROADMAP section 2.7 "JobDeck + Inbox UI" for the full feature spec.

## Your Track: C1 — JobDeck (ROADMAP 2.7)

### Feature Description
A card-based swipe UI for reviewing staged vacancies. Two modes:
- **Queue Mode** (Phase 1, implement this): Review StagedVacancies — swipe right = promote, left = dismiss, up = super-like
- **Inbox Mode** (Phase 2, later): Review promoted Jobs — different actions

### Implementation Plan
1. **DeckCard component** (src/components/staging/DeckCard.tsx):
   - Full card displaying one StagedVacancy at a time
   - Title, employer, location, salary, description preview, match score
   - Action buttons: Dismiss (X), Details (expand), Promote (check), Super-Like (star)

2. **DeckView container** (src/components/staging/DeckView.tsx):
   - Manages the current card index
   - Prefetches next page when approaching end
   - Animation state (swiping, returning, exiting)
   - CSS transforms for card exit animation

3. **ViewModeToggle** (src/components/staging/ViewModeToggle.tsx):
   - Toggle between list view (current) and deck view (new)
   - Integrated into StagingContainer header
   - Persisted to localStorage

4. **useDeckStack hook** (src/hooks/useDeckStack.ts):
   - Navigation: arrow keys, J/K vim-style, button clicks
   - Keyboard shortcuts: D=dismiss, P=promote, S=super-like, Z=undo
   - Only active when deck view is focused (not in text inputs)

5. **StagingContainer integration**:
   - Add ViewModeToggle
   - Conditionally render DeckView or existing list view
   - Share data fetching between both views

6. **Animations**:
   - CSS transforms for card exit (translate + rotate)
   - Spring animation on return (card snaps back)
   - Next card scales up from behind
   - Use CSS transitions, NOT a heavy animation library

### Design Guidelines
- Card: rounded-xl, shadow-lg, max-w-lg mx-auto
- Action buttons: circular, bottom of card, color-coded (red=dismiss, green=promote, blue=super-like)
- Keyboard hint bar below the card showing shortcuts
- Accessible: screen reader announces current card, action buttons have labels
- Mobile: touch swipe gestures, larger tap targets
- Dark mode support

### Before implementing: consult ui-design agent for visual design review

## Process Requirements
- After EACH feature: run /comprehensive-review:full-review
- After each step: blind spot check
- Fix ALL findings autonomously
- Use /full-stack-orchestration:full-stack-feature for implementation
- Commit with logical grouping
- All UI strings in 4 locales (en, de, fr, es)
- Tests: component tests + E2E for swipe flow

## CRITICAL: Parallel Track Safety Rules
- i18n: Create NEW file src/i18n/dictionaries/deck.ts for ALL JobDeck keys. Do NOT add keys to automations.ts or staging.ts.
- Prisma: Do NOT modify prisma/schema.prisma (this track has no schema changes).
- StagingContainer: You OWN the view mode toggle and DeckView rendering. Track 1 may have added an onBlockCompany prop — integrate it if present, don't remove it.
- Dependencies: Do NOT add heavy animation libraries. Use CSS transitions only.

## File Ownership (this track only)
- src/components/staging/DeckCard.tsx (NEW)
- src/components/staging/DeckView.tsx (NEW)
- src/components/staging/ViewModeToggle.tsx (NEW)
- src/components/staging/StagingContainer.tsx (MODIFY — add toggle + DeckView)
- src/hooks/useDeckStack.ts (NEW)
- src/i18n/dictionaries/deck.ts (NEW — own namespace, no conflicts)
- DO NOT modify: src/lib/scheduler/*, src/lib/connector/*, src/app/api/*, prisma/*, src/i18n/dictionaries/automations.ts
PROMPT
)"

run_track "$WORKTREE" "$PROMPT" "$LOG_FILE"
