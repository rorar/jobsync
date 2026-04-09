# Scope Map — Phase 1 Findings

## Task 6: Badge audit (for Stream B)

### Badge component (src/components/ui/badge.tsx)
- Base: `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold`
- **MISSING `whitespace-nowrap`** — text wraps on small screens (this is the core bug)
- 4 variants: default, secondary, destructive, outline
- No fixed heights in base variant

### Clipping hotspots (German/French/Spanish risk)
| File | Class | Risk |
|---|---|---|
| `src/components/kanban/KanbanColumn.tsx` | `min-w-[20px]` on count badge | Clip on 3-digit counts |
| `src/components/kanban/KanbanCard.tsx` | `max-w-[80px] truncate` on tag badges + `text-[10px]` | German tags like "Fernverkehr" truncate |
| `src/components/settings/ApiStatusOverview.tsx` | `text-[10px] px-1.5 py-0 shrink-0` | Tight padding |
| `src/components/settings/ErrorLogSettings.tsx` | `text-[10px] px-1.5 py-0` | Tight padding |

### i18n status
~90% of Badge content already uses `t()`. **No hardcoded English strings found** in Badge content itself. The user's "bookmarked" example likely refers to a badge we need to grep for more explicitly. Primary fix focus: the `whitespace-nowrap` + sizing behavior, not missing translations.

## Task 2/3: Staging hierarchy

```
StagingPage → StagingContainer
  ├─ ListMode: tabs → StagedVacancyCard × N → action handlers
  └─ DeckMode: useDeckStack → DeckView → DeckCard × 3 stack
```

### Superlike return path (for Stream D's fly-in)
```
DeckView.superLike()
  → useDeckStack.performAction("superlike")
  → onAction(vacancy, "superlike")  // StagingContainer's handleDeckAction
  → useStagingActions.promoteStagedVacancyToJob(input)
  → promoteStagedVacancy(input, userId) in lib/connector/job-discovery/promoter.ts
  → Returns ActionResult<{ jobId: string; stagedVacancyId: string }>
```

**KEY:** `promoteStagedVacancyToJob` returns the `jobId`. This is exactly what Stream D's fly-in needs for the "Open created job" CTA. The flow is:
1. `StagingContainer.handleDeckAction` currently returns `{ success }` to `useDeckStack`
2. Stream D must extend this to optionally return `{ success, promotedJobId }` so the fly-in can be triggered
3. Or: the fly-in can be triggered from inside `StagingContainer.handleDeckAction` after the `superlike` branch succeeds

## Task 4: Notification model

### Notification interface
```typescript
interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  moduleId: string | null;
  automationId: string | null;
  data: Record<string, unknown> | null;  // flexible JSON
  read: boolean;
  createdAt: Date;
}

type NotificationType =
  | "module_deactivated" | "module_reactivated" | "module_unreachable"
  | "cb_escalation" | "consecutive_failures" | "auth_failure"
  | "vacancy_promoted" | "vacancy_batch_staged"
  | "bulk_action_completed" | "retention_completed" | "job_status_changed";
```

### Dispatcher (`src/lib/events/consumers/notification-dispatcher.ts`)
- 4 channels: InApp, Webhook, Email, Push
- `data` already JSON — can carry `actionUrl`, `actionLabel`, `actorName`, `reason` without schema change
- VacancyStaged is batched (5s flush)

### Recommendation for Stream E
**No Prisma migration needed** — add `actionUrl`, `actorName`, `reason` to the existing `data: Record<string, unknown>` blob. Components read from `data` with type guards. This preserves backward compat and avoids DB migration.

## localStorage pattern (for Stream F)

Pattern from `src/hooks/useKanbanState.ts`:
- Key naming: `jobsync-{feature}-{aspect}` (e.g. `jobsync-myjobs-view-mode`)
- `getPersisted*()` + `persist*()` exported helpers, SSR-safe with `typeof window === "undefined"` guard
- Hook mounts with default, hydrates from localStorage in `useEffect`
- Write on state change (immediate, synchronous)

Stream F should export:
- `jobsync-staging-layout-size` → `"compact" | "default" | "comfortable"`
- `getPersistedStagingLayoutSize()`, `persistStagingLayoutSize()`, `useStagingLayout()`
