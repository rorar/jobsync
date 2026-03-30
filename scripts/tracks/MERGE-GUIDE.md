# Sprint C: Parallel Track Merge Guide

## Merge Order (STRICT — do not change)

```
1. Track 3 (Public API)     — most isolated, new directories only
2. Track 1 (Blacklist+Cache) — schema + runner changes
3. Track 2 (JobDeck)         — StagingContainer modifications (heaviest merge)
```

## Why This Order
- T3 is the most isolated (new `api/v1/` directory, only touches `middleware.ts`)
- T1 adds schema models — merging after T3 means clean schema diff
- T2 modifies `StagingContainer.tsx` most heavily — merging last means it integrates T1's changes in one pass

## Conflict Zones

### 1. `prisma/schema.prisma` (Track 1 + Track 3)
Both add models + User relations. Merge T3 first, then T1 cleanly diffs.
**Resolution:** Add both relation fields to User model. Run `prisma migrate dev` ONCE on main after each merge.

### 2. `src/i18n/dictionaries/` (All tracks)
Each track uses its OWN namespace file to avoid conflicts:
- Track 1 → `src/i18n/dictionaries/blacklist.ts` (NEW)
- Track 2 → `src/i18n/dictionaries/deck.ts` (NEW)
- Track 3 → `src/i18n/dictionaries/api.ts` (NEW)
Only the barrel `src/i18n/dictionaries/index.ts` needs trivial merge (import lines).

### 3. `src/components/staging/StagingContainer.tsx` (Track 1 + Track 2)
- Track 1 adds `onBlockCompany` handler passed to StagedVacancyCard
- Track 2 adds ViewModeToggle + DeckView conditional rendering
**Resolution:** Keep both changes. T1 merges first (simpler), T2 integrates on top.

### 4. `package.json` / `bun.lockb` (Any track adding dependencies)
**Rule:** Only ONE track runs `bun add` at a time. After all merges, run `bun install` on main to reconcile.

## Prisma Migration Strategy
- Tracks modify `schema.prisma` but do NOT run `prisma migrate dev` in worktrees
- After each merge to main: run `bash scripts/prisma-migrate.sh` on main
- This prevents migration timestamp collisions

## Post-Merge Checklist

```bash
# 1. Schema validation
bash scripts/prisma-migrate.sh

# 2. Type check
source scripts/env.sh && bun run build

# 3. Full test suite
bash scripts/test.sh --no-coverage

# 4. i18n validation
python3 -c "
import re
# ... (validate all keys appear in all 4 locales)
"

# 5. Middleware security check
grep -n 'api/v1' src/middleware.ts  # verify API routes are protected

# 6. Clean lockfile
bun install
```

## Recovery

If a track fails:
- Other tracks are NOT affected (isolated worktrees)
- Main is never contaminated
- Re-run the failed track from a fresh worktree based on current main
- Adjust merge order if needed (skip failed track, merge others first)
