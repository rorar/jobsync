# Twenty CRM Implementation Patterns — Comprehensive Reference for JobSync

> Erstellt: 2026-05-15, Quelle: 6-Agent Deep Exploration of `/home/pascal/projekte/twenty/packages/`
> Ergänzung zu: `specs/reference-twenty-crm.allium` (Domain Model, 1296 Zeilen) + `docs/crm-gap-analysis-twenty.md` (Gap Analysis)
> Agents: 368 Tool-Calls, ~880s Gesamtlaufzeit, 6 parallele Spezialisten

---

## Inhaltsverzeichnis

1. [Timeline/Activity Feed](#1-timelineactivity-feed)
2. [Person/Company Detail Page](#2-personcompany-detail-page)
3. [Workflow/Automation Engine](#3-workflowautomation-engine)
4. [Calendar + Email/Messaging](#4-calendar--emailmessaging)
5. [View System (TABLE/KANBAN/CALENDAR)](#5-view-system)
6. [Cross-Cutting Architecture](#6-cross-cutting-architecture)
7. [JobSync Applicability Matrix](#7-jobsync-applicability-matrix)

---

## 1. Timeline/Activity Feed

### Architecture: Hierarchical composition + month-grouping + infinite scroll

**Key Files:**
```
twenty-front/src/modules/activities/timeline-activities/
  components/
    TimelineCard.tsx          — Container, loading/empty states
    EventList.tsx             — Scroll wrapper, grouping orchestration
    EventsGroup.tsx           — Month separator + vertical timeline bar
    EventRow.tsx              — Event container, icon/content dispatch
  rows/
    components/
      EventRowDynamicComponent.tsx  — Polymorphic dispatcher (switch on linked object type)
      EventCard.tsx                 — Expandable card container
      EventCardToggleButton.tsx     — Expand/collapse toggle
      EventIconDynamicComponent.tsx — Icon dispatcher
    activity/EventRowActivity.tsx   — Task/Note events
    main-object/
      EventRowMainObject.tsx        — CRUD events (created/updated/deleted)
      EventRowMainObjectUpdated.tsx — Multi-field diff with expand/collapse
    message/EventRowMessage.tsx
    calendar/EventRowCalendarEvent.tsx
  hooks/
    useTimelineActivities.ts  — Fetch + pagination (cache-and-network)
  utils/
    groupEventsByMonth.ts     — Month grouping algorithm
    filterOutInvalidTimelineActivities.ts — Schema validation filter
```

### Month Grouping Algorithm

```typescript
type EventGroup = { month: number; year: number; items: TimelineActivity[] };

const groupEventsByMonth = (events: TimelineActivity[]): EventGroup[] => {
  const groups: EventGroup[] = [];
  for (const event of events) {
    const d = new Date(event.createdAt);
    const month = d.getMonth(); // 0-11
    const year = d.getFullYear();
    const match = groups.find(x => x.year === year && x.month === month);
    if (match) match.items.push(event);
    else groups.push({ year, month, items: [event] });
  }
  return groups.sort((a, b) => b.year - a.year || b.month - a.month);
};
```
Note: O(n^2) due to `.find()` — optimize with `Map<string, EventGroup>` for 1000+ events.

### Polymorphic Event Dispatch

```typescript
// EventRowDynamicComponent.tsx — dispatch on linked object type
switch (linkedObjectMetadataItem?.nameSingular) {
  case 'calendarEvent': return <EventRowCalendarEvent {...props} />;
  case 'message':       return <EventRowMessage {...props} />;
  case 'task':          return <EventRowActivity objectNameSingular={Task} {...props} />;
  case 'note':          return <EventRowActivity objectNameSingular={Note} {...props} />;
  default:              return <EventRowMainObject {...props} />;  // Field changes
}
```

### Vertical Timeline Bar (CSS)

```css
/* Absolute bar spanning all events in a month group */
.ActivityGroupBar {
  position: absolute; top: 0; width: 24px; height: 100%;
  background: var(--background-secondary);
  border: 1px solid var(--border-color-light);
  border-radius: var(--border-radius-md);
}
/* Vertical connector between events */
.VerticalLine { background: var(--border-color-light); width: 2px; height: 100%; }
/* Only rendered if NOT last event */
```

### Infinite Scroll

Uses `react-intersection-observer`:
```typescript
// CustomResolverFetchMoreLoader.tsx
const { ref } = useInView({
  onChange: (inView) => { if (inView) onLastRowVisible(); }
});
return <div ref={ref}>{loading && "Loading more..."}</div>;
```

### Expandable Field Diffs

For multi-field updates: summary with toggle -> expandable card:
```typescript
const [isOpen, setIsOpen] = useState(true);
if (diffEntries.length === 1) return <EventFieldDiffContainer />;
if (diffEntries.length > 1) return (
  <>
    <span>{fieldCount} fields changed</span>
    <EventCardToggleButton isOpen={isOpen} setIsOpen={setIsOpen} />
    {isOpen && <EventCard>{diffEntries.map(...)}</EventCard>}
  </>
);
```

### Activity Title Resolution (3-tier fallback)

1. **From Apollo cache** — latest record data
2. **From event snapshot** — `linkedRecordCachedName` (set at event creation)
3. **Fallback** — "Untitled"

---

## 2. Person/Company Detail Page

### Architecture: Tab-based layout with widget system

**Key Files:**
```
twenty-front/src/modules/page-layout/
  components/
    PageLayoutRenderer.tsx          — Main orchestrator (initializes tabs + contexts)
    PageLayoutTabsRenderer.tsx      — Tab bar (responsive: mobile dropdown)
    PageLayoutMainContent.tsx       — Routes to VERTICAL_LIST or CANVAS layout
    PageLayoutVerticalListViewer.tsx — Stacks widgets vertically (Home tab)
    PageLayoutCanvasViewer.tsx      — Single widget full-container (other tabs)
  constants/
    DefaultPersonRecordPageLayout.ts  — 7 tabs: Home, Timeline, Tasks, Notes, Files, Emails, Calendar
    DefaultCompanyRecordPageLayout.ts — Identical structure to Person
  widgets/
    components/
      WidgetContentRenderer.tsx       — Switch dispatcher (21 widget types)
      WidgetCardShell.tsx             — Widget container with header, actions, error boundary
    fields/FieldsWidget.tsx           — Field groups with inline editing
    timeline/TimelineWidget.tsx       — Activity timeline container
    tasks/TaskWidget.tsx, notes/NoteWidget.tsx, files/FileWidget.tsx
    record-table/RecordTableWidgetRenderer.tsx  — Related records (jobs for person, etc.)
    email-thread/EmailThreadWidget.tsx
```

### Layout Configuration Data Structure

```typescript
PageLayout {
  tabs: PageLayoutTab[]
}
PageLayoutTab {
  title: string           // "Home", "Timeline", "Tasks", ...
  icon: string            // "IconHome", "IconTimelineEvent", ...
  position: number        // 100, 200, 300, ...
  layoutMode: 'VERTICAL_LIST' | 'CANVAS'
  widgets: PageLayoutWidget[]
}
PageLayoutWidget {
  type: WidgetType        // FIELDS, TIMELINE, TASKS, NOTES, FILES, EMAILS, CALENDAR, RECORD_TABLE
  configuration: FieldsConfiguration | WidgetConfiguration
  position: { layoutMode, index } | { layoutMode, gridPosition }
}
```

### Widget Types (21 supported)

GRAPH, FIELD, FIELDS, TIMELINE, TASKS, NOTES, FILES, EMAILS, CALENDAR, RECORD_TABLE, FRONT_COMPONENT, IFRAME, FIELD_RICH_TEXT, STANDALONE_RICH_TEXT, WORKFLOW, WORKFLOW_VERSION, WORKFLOW_RUN, EMAIL_THREAD, and more.

### Header/Breadcrumb Pattern

```
[People icon] People / [Editable Name] (1/50)
  Click "People" -> navigateToIndexView()
  Click name -> inline edit with save
  Pagination: useRecordShowPagePagination() -> rankInView + totalCount
```

### Responsive Design

- **Mobile (<768px):** Single column, only first tab visible, others in dropdown
- **Desktop:** Full tab bar with reorder capability
- **Side Panel:** Compact variant, maintains main record context while viewing related

### Related Records (RECORD_TABLE widget)

Shows jobs for a person, contacts for a company:
```typescript
case WidgetType.RECORD_TABLE:
  return <RecordTableWidgetRenderer widget={widget} />
// Requires: objectMetadataId (related object type) + viewId (columns/filters)
```

### State Management

Jotai atoms with component instance scoping:
```typescript
activeTabIdComponentState         — Which tab is showing
currentPageLayoutState            — Current layout structure
isLayoutCustomizationModeEnabled  — Edit mode toggle
// Instance IDs prevent state collision between multiple panels
```

---

## 3. Workflow/Automation Engine

### Architecture: React Flow DAG (frontend) + Factory-based executor (backend)

**Frontend Files:**
```
twenty-front/src/modules/workflow/workflow-diagram/
  components/
    WorkflowVisualizer.tsx                    — Top-level orchestrator
    WorkflowDiagramCanvasEditable.tsx         — React Flow canvas with connection handlers
  workflow-nodes/                             — Custom node types (trigger, step, empty)
  workflow-edges/                             — Custom edge types (editable, blank)
  utils/generateWorkflowDiagram.ts           — Step data -> React Flow nodes/edges
```

**Backend Files:**
```
twenty-server/src/modules/workflow/
  workflow-executor/
    workspace-services/workflow-executor.workspace-service.ts  — DAG traversal engine
    factories/workflow-action.factory.ts                       — Action type -> executor mapping
  workflow-runner/jobs/run-workflow.job.ts                      — BullMQ job processor
  workflow-trigger/
    automated-trigger/listeners/workflow-database-event-trigger.listener.ts
  workflow-builder/workflow-version/workflow-version.workspace-service.ts
```

### DAG Traversal Algorithm

1. Entry: `executeFromSteps(stepIds)` — accepts multiple step IDs
2. Parallel execution: `Promise.all()` for sibling steps
3. Decision logic per step:
   - `shouldExecuteStep()` — checks parent completion
   - `shouldFailSafely()` — propagates FAILED_SAFELY from parent
4. Next step resolution:
   - IF_ELSE: evaluate filter -> follow matching branch
   - ITERATOR: loop body if more items
   - Normal: `nextStepIds` array
5. Job continuation: if >20 steps executed, enqueue new BullMQ job

### WorkflowActionOutput

```typescript
{
  result?: object;
  error?: string;
  pendingEvent?: boolean;           // FORM step waiting for user input
  shouldEndWorkflowRun?: boolean;
  shouldRemainRunning?: boolean;    // Delays, webhooks
  shouldSkipStepExecution?: boolean;
  shouldFailSafely?: boolean;       // Continue on error
}
```

### Version Management

- DRAFT -> ACTIVE -> DEACTIVATED -> ARCHIVED
- Invariant: Only ONE DRAFT per workflow
- Activation: validates trigger + steps, registers automated triggers
- Deactivation: removes trigger registrations, running workflows continue

### Trigger Types

| Type | Implementation |
|------|---------------|
| DATABASE_EVENT | `@OnDatabaseBatchEvent('*', action)` listener, field-level change detection |
| CRON | Cache-based trigger evaluation, schedule -> cron expression |
| MANUAL | GraphQL mutation, availability scopes (global, single-record, bulk) |
| WEBHOOK | GET/POST with API_KEY auth (infrastructure ready, not fully implemented) |

### Error Handling

- Per-step `shouldFailSafely` flag (FAILED_SAFELY status propagates downstream)
- Iterator: `continueOnFailure` wraps errors
- Max 10,000 iterations (infinite loop prevention)
- Max 20 steps per job (memory protection)
- Staled run recovery: RUNNING -> NOT_STARTED after timeout

---

## 4. Calendar + Email/Messaging

### Calendar Sync State Machine

```
PENDING_CONFIGURATION
  -> CALENDAR_EVENT_LIST_FETCH_PENDING -> SCHEDULED -> ONGOING
  -> CALENDAR_EVENTS_IMPORT_PENDING -> SCHEDULED -> ONGOING
  -> Back to LIST_FETCH_PENDING (incremental sync)
  -> FAILED (on error)
```

**Key Entity: CalendarChannel**
```typescript
{
  handle: string | null
  syncStatus: SyncStatus
  syncStage: SyncStage
  visibility: CalendarChannelVisibility
  isContactAutoCreationEnabled: boolean
  contactAutoCreationPolicy: CalendarContactAutoCreationPolicy
  isSyncEnabled: boolean
  syncCursor: string | null        // Server sync token
  throttleFailureCount: number     // Backoff counter
  connectedAccount: ConnectedAccount
}
```

### Messaging Sync State Machine

Same 2-phase pattern: LIST_FETCH -> IMPORT, plus:
- Folder-level sync policies (`messageFolderImportPolicy`)
- Group email handling (`excludeGroupEmails`)
- Professional email filtering (`excludeNonProfessionalEmails`)
- `throttleRetryAfter: string | null` (explicit retry windows)

### Participant Matching Algorithm

```
1. Extract unique email handles from participants
2. Query Person by primary + additional emails (exact match)
3. Query WorkspaceMember by email handle
4. Update participant records with matched IDs
5. Emit workspace events for cascade operations
```

Three modes: `workspaceMemberOnly`, `personOnly`, `workspaceMemberAndPerson`

### Contact Auto-Creation from Import

```
If channel.isContactAutoCreationEnabled:
  -> Check blocklist (exact email + domain pattern)
  -> Extract domain from email handle
  -> Find or create Company by domain
  -> Create Person with matched company
  -> Source: FieldActorSource.CALENDAR | FieldActorSource.EMAIL
```

### Error Handling & Retry

- `throttleFailureCount` incremented on errors
- Max attempts: constant per channel type
- After max -> FAILED state -> requires manual reconnection
- Exception types: TEMPORARY_ERROR (retry), INSUFFICIENT_PERMISSIONS (mark auth_failed_at), SYNC_CURSOR_ERROR (reset cursor)
- Stale detection: `isSyncStale(syncStageStartedAt)` checks against timeout constant

### Frontend Email Thread UI

```
EmailThreadWidget
  First 2 messages (collapsed by default)
  Intermediary messages (hidden, expandable section)
  Last message (expanded)
  EmailComposer (reply area, auto-populated recipients)

EmailThreadMessage
  Header: sender + date (click to toggle)
  Receivers (shown when expanded)
  Body: preview (collapsed) / full (expanded)
```

### Calendar UI Structure

```
RecordCalendar (container)
  RecordCalendarTopBar (month nav, today button)
  RecordCalendarMonth (drag-drop context via @hello-pangea/dnd)
    RecordCalendarMonthHeader (day-of-week labels)
    RecordCalendarMonthBody
      RecordCalendarMonthBodyWeek (7 columns)
        RecordCalendarMonthBodyDay (date, add button on hover)
          RecordCalendarCardDraggableContainer (max 5 cards)
```

Date navigation: `Temporal.PlainDate` (not Date object). Min 122px per cell.

### Driver Architecture

| Type | Drivers |
|------|---------|
| Calendar | `caldav-driver/`, `google-calendar-driver/`, `microsoft-calendar-driver/` |
| Messaging | `gmail/`, `microsoft/`, `imap/`, `smtp/`, `inbound-email/` (webhook) |

### ConnectedAccount Entity

```typescript
{
  handle: string | null              // Primary email
  provider: ConnectedAccountProvider // GOOGLE, MICROSOFT, IMAP, etc.
  authFailedAt: Date | null          // Degradation marker
  handleAliases: string[] | null     // Alt emails for matching
  scopes: string[] | null
  accountOwnerId: string
}
```

---

## 5. View System

### Architecture: Persisted view entity with filter/sort/group/column configuration

**Key Files:**
```
twenty-front/src/modules/views/
  types/                        — View, ViewField, ViewFilter, ViewSort, ViewGroup
  states/selectors/             — viewsSelector, viewFromViewIdFamilySelector
  hooks/                        — useApplyCurrentView*, useCreate*, useSave*
  view-picker/
    components/ViewPickerDropdown.tsx  — View switcher UI
    hooks/useCreateViewFromCurrentState.ts, useUpdateViewFromCurrentState.ts
    states/                     — viewPickerInputNameComponentState, etc.
  graphql/mutations/            — createView, updateView, createViewField, etc.
  utils/mapViewFieldsToColumnDefinitions.ts

twenty-front/src/modules/object-record/
  record-table/                 — Table view (virtualized rows, inline editing)
  record-board/                 — Kanban view (columns, drag-drop)
  record-calendar/              — Calendar view (month grid, draggable cards)
  record-filter/states/         — currentRecordFiltersComponentState
  record-sort/states/           — currentRecordSortsComponentState
  record-group/                 — Group-by logic, visibleRecordGroupIds
```

### View Entity Data Model

```typescript
View {
  id, name, icon, position
  type: TABLE | KANBAN | CALENDAR
  objectMetadataId: UUID            // Which object type
  isCompact: boolean
  visibility: WORKSPACE | OWNER
  // Kanban-specific
  mainGroupByFieldMetadataId?: UUID
  kanbanAggregateOperation?: SUM | AVG | COUNT
  shouldHideEmptyGroups: boolean
  // Calendar-specific
  calendarFieldMetadataId?: UUID
  calendarLayout: MONTH | WEEK | DAY
  // Child collections
  viewFields: ViewField[]           // Column visibility, order, size
  viewFilters: ViewFilter[]         // Applied filters
  viewFilterGroups: ViewFilterGroup[] // Nested AND/OR logic
  viewSorts: ViewSort[]             // Sort configuration
  viewGroups: ViewGroup[]           // Group-by values (Kanban columns)
}
```

### Hierarchical Filter Groups

```
ViewFilterGroup (AND)
  ViewFilter (Status = Won)
  ViewFilterGroup (OR)
    ViewFilter (Amount > 10000)
    ViewFilter (CreatedAt > 2024-01-01)
```

30+ operands: CONTAINS, EQ, NE, GT, LT, BEFORE, AFTER, WITHIN_PAST_DAYS, IS_TODAY, IS_THIS_WEEK, REGEX_MATCH, HAS_ANY_OF, HAS_NONE_OF, etc.

### State Flow: View -> Records

```
viewId changes ->
  useApplyCurrentViewFiltersToCurrentRecordFilters()
    View.viewFilters -> RecordFilter[] -> currentRecordFiltersComponentState
  useApplyCurrentViewSortsToCurrentRecordSorts()
    View.viewSorts -> currentRecordSortsComponentState
  useApplyCurrentViewFieldsToCurrentRecordFields()
    View.viewFields -> column visibility/order/size
```

Two parallel hierarchies: **View State** (persisted DB config) vs **Record State** (transient runtime).

### View CRUD

- **Create:** Name, icon, type, optional "from current" (copies filters/sorts/columns)
- **Edit:** Name, icon, visibility inline
- **Delete:** Switch to first remaining view, then destroy
- **Duplicate:** Copy all child entities

### Table View

- Row virtualization via `react-window`
- Inline cell editing (click to edit, Enter to commit, Escape to cancel)
- Column resize, reorder, show/hide
- Multi-select: shift+click range, checkbox column

### Kanban View

- Columns from group-by field values (e.g., Status values -> columns)
- Drag-drop between columns updates the group-by field
- Aggregate operations per column (COUNT, SUM, AVG)
- `shouldHideEmptyGroups` option

---

## 6. Cross-Cutting Architecture

### Monorepo Structure

| Package | Purpose | Tech |
|---------|---------|------|
| `twenty-front` | React frontend | Vite, Linaria, Jotai, Apollo Client |
| `twenty-server` | NestJS backend | TypeORM, GraphQL (Yoga), Redis, BullMQ |
| `twenty-shared` | Shared types/utils | TypeScript, Zod |
| `twenty-ui` | Component library | Storybook, Linaria |
| `twenty-emails` | Email templates | React Email |
| `twenty-sdk` | Client SDK | TypeScript |

### Event-Driven Architecture

```
Record mutation (CRUD)
  -> WorkspaceEventEmitter.emitDatabaseBatchEvent()
  -> NestJS EventEmitter2 broadcasts: "{objectName}.{action}"
  -> @OnDatabaseBatchEvent() listeners consume
     -> Enqueue BullMQ jobs for async processing
        -> Timeline materialization, workflow triggers, etc.
```

Event payload:
```typescript
WorkspaceEventBatch<T> {
  name: string               // e.g., "person.created"
  workspaceId: string
  objectMetadata: FlatObjectMetadata
  events: ObjectRecordEvent<T>[]   // Batch of 1+ events
}
```

Event types: `CreateEvent`, `UpdateEvent` (before+after), `DeleteEvent`, `DestroyEvent`, `RestoreEvent`, `UpsertEvent`

### Background Job System (BullMQ)

Queues: workflowQueue, timelineQueue, messagingQueue, calendarQueue, etc.

```typescript
// Enqueue
await messageQueueService.add<JobData>(JobName, data, { priority: 1 });
// Process
@Processor(MessageQueue.workflowQueue)
@Process(WorkflowTriggerJob.name)
async handle(job: Job<JobData>) { ... }
```

### Multi-Tier Caching

| Layer | TTL | Scope | Purpose |
|-------|-----|-------|---------|
| L1 Local Memory | 100ms | Per-instance | Same-request dedup |
| L2 Memoization | 10s | Per-process | Thundering herd prevention |
| L3 Redis | 30min+ | Distributed | Cross-instance sharing |

### TwentyORM (Custom ORM Layer)

- Wraps TypeORM for multi-tenant, permission-aware data access
- `AsyncLocalStorage` for workspace context isolation (no explicit workspaceId passing)
- `WorkspaceRepository<T>` with RLS (Row-Level Security) predicates
- Permission enforcement at repository level (not in application code)

### Authentication Architecture

```typescript
// Auth context types
type WorkspaceAuthContextType = 'system' | 'user' | 'apiKey' | 'application';

// Middleware chain
GraphQLHydrateRequestFromTokenMiddleware  // JWT extraction
  -> WorkspaceAuthContextMiddleware       // Build auth context
  -> Guards (WorkspaceAuthGuard, UserAuthGuard)

// Context storage: AsyncLocalStorage (async-context)
const ctx = getWorkspaceAuthContext();  // Available anywhere in call stack
```

### Real-Time Subscriptions

Redis pub/sub -> GraphQL subscriptions:
- Event stream: `EVENT_STREAM_CHANNEL:{workspaceId}:{channelId}`
- Frontend WebSocket receives batched events -> Apollo cache update -> React re-render

### Frontend State Management (Jotai)

```typescript
// Simple state
createAtomState({ key: 'myState', defaultValue: initial });
// Component-instance scoped (prevents collision between multiple panels)
createAtomComponentState({ key: 'field__value', componentInstanceContext: id });
// Atom families (keyed by ID)
createAtomFamilyState({ key: 'records', defaultValue: (id) => ({}) });
// Persistence: localStorage, sessionStorage, cookie, or in-memory
```

### Apollo Client

- Fetch policy: `cache-and-network` (return cached, fetch in background)
- Optimistic updates: `triggerCreateRecordOptimisticEffect`, `triggerUpdateRecordOptimisticEffect`
- Cache invalidation: manual via `refetchQueries` + automatic via subscription

---

## 7. JobSync Applicability Matrix

### Direct Adoptions (implementierbar in aktueller Session)

| Pattern | Twenty Source | JobSync Target | Effort |
|---------|-------------|----------------|--------|
| Month grouping algorithm | `groupEventsByMonth.ts` | ActivityTimeline component | S |
| Polymorphic event row dispatch | `EventRowDynamicComponent.tsx` | Switch on `activityType` | S |
| Vertical timeline bar CSS | `EventsGroup.tsx` styled components | Tailwind equivalent | S |
| Infinite scroll (IntersectionObserver) | `CustomResolverFetchMoreLoader.tsx` | Timeline pagination | S |
| Expandable field diffs | `EventRowMainObjectUpdated.tsx` | ActivityLog detail cards | S |
| Tabbed detail page | `PageLayoutRenderer.tsx` + constants | CompanyDetail + PersonDetail tabs | M |
| Related records widget | `RecordTableWidgetRenderer.tsx` | Jobs-for-Company, Contacts-for-Job | M |

### Foundation Patterns (für nächste ROADMAP Items)

| Pattern | Twenty Source | JobSync ROADMAP | When |
|---------|-------------|-----------------|------|
| Sync state machine (2-phase) | `CalendarChannelSyncStage` | 1.7 Calendar, 1.12 Communication | When starting connectors |
| Participant matching (email->Person) | `MatchParticipantService` | 1.12 Communication | When starting email sync |
| Contact auto-creation from import | `AutoCreatePersonFromParticipant` rule | 1.12 Communication | When starting email sync |
| Blocklist filtering during import | `BlocklistFiltersDuringSyncImport` rule | 1.12 Communication | Foundation ready |
| Email thread UI (collapsible cards) | `EmailThreadWidget` + `EmailThreadMessage` | 1.12 Communication UI | When building thread view |
| Calendar month grid + drag-drop | `RecordCalendar` + `RecordCalendarCard` | 1.7 Calendar UI | When building calendar view |
| Handle aliases for matching | `ConnectedAccount.handleAliases` | 1.12 Communication | Multi-email support |

### Future Evolution Patterns (bewusst deferred)

| Pattern | Twenty Source | JobSync Gap | Decision |
|---------|-------------|-------------|----------|
| View entity (persisted filters/sorts) | Full View system (5 entities) | Gap 9: Saved Views | Future — hardcoded views sufficient |
| View switcher dropdown | `ViewPickerDropdown.tsx` | No view switching UI | Future |
| Hierarchical filter groups (AND/OR) | `ViewFilterGroup` (recursive) | Inline filters only | Future |
| React Flow DAG visualization | `WorkflowVisualizer.tsx` | AutomationWizard sufficient | Future |
| Workflow version management | DRAFT->ACTIVE->DEACTIVATED | No versioning needed | Future |
| Rich text (Tiptap/Lexical) | `body_v2: RichText` on Note/Task | Plain text body | Gap 8: Future |
| Canvas grid layout (react-grid-layout) | `PageLayoutGridLayout.tsx` | Vertical tabs sufficient | Overkill |
| Custom Objects / dynamic schema | TwentyORM metadata system | Fixed Prisma schema | N/A |

### Architecture Validation (JobSync vs Twenty)

| Aspect | Twenty | JobSync | Assessment |
|--------|--------|---------|------------|
| Event emission | Sync emit, async BullMQ jobs | TypedEventBus, async consumers | Aligned |
| State management | Jotai atoms, scoped instances | React hooks, localStorage | Similar pattern |
| Auth context | AsyncLocalStorage | `getCurrentUser()` + session | Simpler but adequate |
| Database | TypeORM + custom ORM + RLS | Prisma + userId in WHERE | Simpler, IDOR-safe |
| Caching | 3-tier (local+memo+Redis) | In-memory LRU + HTTP headers | Adequate for scale |
| Background jobs | BullMQ (Redis) | Scheduler + cron | Simpler, no queue needed yet |
| Real-time | Redis pub/sub + GraphQL subs | SSE (SchedulerStatus) | SSE sufficient |
| Status machines | Loose string enums | Validated transitions (Allium) | JobSync BETTER |
| GDPR | No built-in GDPR fields | dataSource, processingBasis, retention | JobSync BETTER |
| Company relations | 1:1 Person->Company | N:M CompanyAssociation | JobSync BETTER |

---

## 8. ROADMAP Mapping: Twenty-Patterns für offene Items

### Offene ROADMAP Items mit Twenty-Äquivalent

| ROADMAP | Item | Twenty Status | Key Technology | Effort |
|---------|------|---------------|----------------|--------|
| **0.7** | Volltextsuche | **JA** — PostgreSQL tsvector + ILIKE Fallback | Two-tier: `ts_rank_cd` (AND) + `ts_rank` (OR), unaccent, cursor pagination | S |
| **1.2** | Workflow Connector (n8n) | **PARTIAL** — Webhook Trigger vorhanden | `POST /webhooks/workflows/:workspaceId/:workflowId`, kein outbound callback | M |
| **1.3** | Webhook Connector (incoming) | **JA** — Event-triggered Delivery | BullMQ Jobs, Chunking (20/Batch), Retry 3×, Event Transformation | S |
| **2.11** | Marketplace UI | **JA** — 3-Tab Settings + Install/Upgrade | `ApplicationEntity`, `findManyMarketplaceApps`, Feature-Flag-gated | M |
| **2.19** | Client-Side Data Layer | **JA** — Apollo + Jotai Hybrid | Optimistic Updates, RetryLink, `recordStoreFamilyState` Atom Family | S |
| **2.20** | Spotlight / Cmd+K | **JA** — Command Menu + Global Search | Cross-Object Search, Cursor Pagination, Mobile Fallback | S |
| **3.3** | Rich Text Editor | **JA** — BlockNote (ProseMirror) | Slash Commands, @Mentions, File Upload, Debounced Save (300ms) | S |
| **5.8** | Import/Export | **PARTIAL** — SQL Export + File Upload Infra | Workspace Export Service, kein CSV Import/Export | M |
| **8.7** | Module SDK | **JA** — ApplicationEntity + Extensions | Custom Objects, Logic Functions, Front Components, Command Menu Items | M |
| **9.1** | CareerBERT / Semantic Search | **NEIN** — Nicht implementiert | Nur `@ai-sdk/openai` Dependency, kein Vector DB | H |

### Offene ROADMAP Items ohne Twenty-Äquivalent

| ROADMAP | Item | Warum nicht in Twenty | JobSync muss eigenständig implementieren |
|---------|------|----------------------|----------------------------------------|
| **1.13+** | Data Enrichment Phase 2+ | Twenty hat keine native Enrichment-Pipeline | JobSync's Fallback-Chain-Orchestrator ist bereits besser |
| **2.1** | Onboarding Wizard | **JA** (siehe unten) | Twenty hat vollen Onboarding-Flow |
| **3.8** | Job Maintenance/Staleness | **PARTIAL** — Stale Run Detection vorhanden | `isSyncStale()` Pattern, Trash Cleanup Cron |
| **4.2** | Document Generation | **PARTIAL** — SQL Export + Python PDF Sandbox | Kein react-pdf, kein Template System |
| **5.7** | Contact Extraction (NLP) | **NEIN** — Nur Email-Handle-Parsing | Rule-based, kein NLP/LLM |
| **6.1** | GDPR | **MINIMAL** — Nur `anonymize()` Utility | Kein delete-account, kein data-export, kein consent |
| **8.0** | Testing Strategy | **JA** — Jest + Vitest + Playwright + 379 Integration Specs | Workspace-Isolation, `@swc/jest`, E2E mit Retries |
| **8.8** | Production Monitoring | **JA** — NestJS Terminus + OpenTelemetry | 5 Health Indicators, Queue Metrics, Admin Panel GraphQL |

### Twenty Onboarding Flow (für ROADMAP 2.1)

Twenty hat einen vollständigen Onboarding-Flow mit State Machine:
```
OnboardingStatus: PLAN_REQUIRED → WORKSPACE_ACTIVATION → PROFILE_CREATION
  → SYNC_EMAIL → INVITE_TEAM → BOOK_ONBOARDING → COMPLETED
```

**Key Files:**
- `twenty-server/src/engine/core-modules/onboarding/onboarding.service.ts` — Status-Berechnung
- `twenty-front/src/modules/onboarding/hooks/useOnboardingStatus.ts` — Frontend-Status
- `twenty-front/src/pages/onboarding/` — 9 Step-Pages (CreateWorkspace, CreateProfile, SyncEmails, etc.)

**Pattern:** User-Vars Key-Value Store pro User+Workspace, Bypass-Checks für Fresh Reads, Billing-Integration.

### Twenty Volltextsuche (für ROADMAP 0.7)

Two-tier Hybrid-Ansatz:
```typescript
// Tier 1: PostgreSQL tsvector mit GIN Index
ts_rank_cd(search_vector, to_tsquery('simple', unaccent(:terms)))  // AND-Mode
ts_rank(search_vector, to_tsquery('simple', unaccent(:termsOr)))    // OR-Mode

// Tier 2: ILIKE Fallback (wenn tsvector 0 Ergebnisse)
WHERE unaccent(search_vector::text) ILIKE unaccent(:word)  // pro Wort
```

**Key Files:**
- `twenty-server/src/engine/core-modules/search/services/search.service.ts` (731 Zeilen)
- `twenty-server/src/engine/core-modules/search/utils/format-search-terms.ts`

### Twenty Command Palette (für ROADMAP 2.20)

```
Cmd+K → CommandMenuOpenContainer (Modal)
  → Cross-Object Search (GraphQL: recordId, objectName, label, imageUrl, tsRank)
  → Commands (Navigation Pins)
  → Actions (Quick Actions)
  → Cursor Pagination, Mobile Fallback
```

**Key Files:**
- `twenty-front/src/modules/command-menu/components/CommandMenuOpenContainer.tsx`
- `twenty-front/src/modules/command-menu/hooks/useCommandMenuHotKeys.ts`
- `twenty-front/src/modules/command-menu/graphql/queries/search.ts`

### Twenty Rich Text Editor (für ROADMAP 3.3)

Twenty verwendet **BlockNote** (ProseMirror-basiert, nicht Tiptap):
```typescript
const editor = useCreateBlockNote({
  schema: BLOCK_SCHEMA,
  uploadFile: handleEditorBuiltInUploadFile,
  placeholders: { default: "Type '/' for commands, '@' for mentions" },
});
// Debounced save: 300ms → GraphQL mutation
```

**Key Files:**
- `twenty-front/src/modules/blocknote-editor/` — Vollständiges Editor-Modul
- `twenty-front/src/modules/object-record/record-field/ui/meta-types/input/components/RichTextFieldEditor.tsx`

**Hinweis:** JobSync's ROADMAP 3.3 plant Tiptap-Erweiterungen. BlockNote ist eine Alternative — beide basieren auf ProseMirror. Entscheidung: bei Tiptap bleiben (weniger Migration) oder zu BlockNote wechseln (moderneres Block-UI).

### Twenty Marketplace (für ROADMAP 2.11)

3-Tab Settings UI:
1. **Marketplace** — Verfügbare Apps (Feature-Flag-gated: `IS_MARKETPLACE_SETTING_TAB_VISIBLE`)
2. **Installed** — Aktive Apps + Management
3. **Developer** — API Keys, OAuth Registration

**Key Files:**
- `twenty-front/src/pages/settings/applications/SettingsApplications.tsx`
- `twenty-front/src/modules/marketplace/graphql/mutations/installMarketplaceApp.ts`
- `twenty-server/src/engine/core-modules/application/application.entity.ts` — ApplicationEntity mit `universalIdentifier`, `version`, `sourceType`

### Twenty Health/Monitoring (für ROADMAP 8.8)

5 pluggable Health Indicators via NestJS Terminus:
```
GET /healthz → PublicEndpointGuard → check([database, redis, worker, connectedAccount, app])
```

Queue Metrics mit Time Ranges (1h, 6h, 24h): completed, failed, active, pending.
OpenTelemetry Observable Gauges mit 1-Minute Cache.

**Key Files:**
- `twenty-server/src/engine/core-modules/health/controllers/health.controller.ts`
- `twenty-server/src/engine/core-modules/admin-panel/admin-panel-health.service.ts`
- `twenty-server/src/engine/core-modules/metrics/metrics.service.ts`

---

## 9. Improvements für fertige Features

### Priorität 1 — Quick Wins (≤2h Effort)

| Feature | Improvement | Twenty-Quelle | Effort |
|---------|-------------|---------------|--------|
| **0.10 Scheduler** | `@WithLock` Decorator für RunCoordinator Critical Sections | `cache-lock/with-lock.decorator.ts` — Redis-backed, TTL 5.5s, exponential backoff | S |
| **0.4 Lifecycle** | Feature Flag System für graduelle Rollouts | `feature-flag/services/feature-flag.service.ts` — Workspace-scoped, Cache-backed | S |
| **0.6 Notifications** | Webhook Chunking (20 Items/Batch) statt einzeln | `webhook/jobs/call-webhook-jobs.job.ts` — Batch-Processing | S |
| **7.1 API** | API Key Expiration + Warnungen | `api-key/api-key.entity.ts` — expiresAt, revocation Flag | S |
| **0.11 Logo Cache** | Async File Deletion statt synchron | `file/jobs/file-deletion.job.ts` — BullMQ Job | S |

### Priorität 2 — Nächster Sprint (2-8h)

| Feature | Improvement | Twenty-Quelle | Effort |
|---------|-------------|---------------|--------|
| **0.5 Pipeline** | Bulk Update Form UI (Multi-Select → Edit Form) | `record-update-multiple/components/UpdateMultipleRecordsForm.tsx` | M |
| **5.6 Kanban** | Multi-Drag mit Count-Badge Preview | `record-board-card/components/RecordBoardCardMultiDragPreview.tsx` + `processMultiDrag.ts` | M |
| **0.10 Scheduler** | Stale Run Detection + Cleanup Cron | `workflow-handle-staled-runs.cron.job.ts` — Detect RUNNING > 30min, mark FAILED | M |
| **5.3 Status** | Event-Driven Side-Effect Listeners (decouple from action) | `workflow-status/listeners/workflow-version-status.listener.ts` | M |
| **0.4 Lifecycle** | Workspace Cache mit Recomputation Pattern | `workspace-cache/services/workspace-cache.service.ts` — `getOrRecompute()` | M |

### Priorität 3 — Strategische Verbesserungen (8h+)

| Feature | Improvement | Twenty-Quelle | Effort |
|---------|-------------|---------------|--------|
| **Cross-Cutting** | Message Queue für alle Async-Operationen | `message-queue/services/message-queue.service.ts` — BullMQ Foundation | L |
| **5.6 Kanban** | Drag-Drop Bibliothek `@hello-pangea/dnd` evaluieren (vs @dnd-kit) | Twenty's Production-proven Kanban mit hello-pangea | M |
| **7.1 API** | Role-Based API Key Scoping (read-only vs read-write) | `api-key/api-key.entity.ts` — roleId FK | M |

### Wo JobSync BESSER ist als Twenty

| Bereich | JobSync Vorteil | Twenty Schwäche |
|---------|----------------|-----------------|
| **Notifications** | 4 Kanäle (InApp, Webhook, Email, Push) + Late-Binding i18n | Nur Webhook-Delivery, kein InApp Bell |
| **Status Machine** | Validierte Transitions + Allium Spec + History | Lose String-Enums, keine Validierung |
| **GDPR** | dataSource, processingBasis, retentionExpiresAt, anonymizePerson, deleteAccount | Nur `anonymize()` Utility |
| **Company Relations** | N:M CompanyAssociation mit Role + Temporal Bounds | 1:1 Person→Company |
| **Enrichment** | Fallback-Chain-Orchestrator + Cache + Audit Trail | Keine native Enrichment-Pipeline |
| **Security** | SSRF Validation, SVG Sanitization, IDOR Ownership, Admin Tiered Rule | Weniger sichtbare SSRF/SVG-Schutzmaßnahmen |
| **Resilience** | Cockatiel (Circuit Breaker + Retry + Rate Limit) per Module | Einfaches Caching, kein CB |
| **Staging UX** | JobDeck Swipe + SuperLike Celebration + Undo/Redo | Keine Swipe/Gesture Patterns |

---

## 10. UX Deep-Dive: Design System, Patterns & Micro-Interactions

### Design System (twenty-ui)

**Tokens & Theming:**
- Radix UI Colors (P3 color space), 20+ Farben mit separaten Light/Dark-Definitionen
- Typography: Inter, Scale xxs (0.625rem) → xxl (1.85rem), Weights 400/500/600
- Icons: Tabler Icons (`@tabler/icons-react`), 5000+ Icons
- Spacing: `spacing[0]` bis `spacing[20]` (Vielfache einer Base Unit)
- Animation Durations: instant (75ms), fast (150ms), normal (300ms), slow (1500ms)
- Breakpoint: `MOBILE_VIEWPORT = 768px`
- CSS-in-JS: **Linaria** (zero-runtime, styled-components-API)

**Key Files:**
- `twenty-ui/src/theme/constants/` — 50+ Token-Dateien
- `twenty-ui/src/theme/constants/Animation.ts` — Duration-Konstanten
- `twenty-ui/src/theme/constants/MainColorsLight.ts` + `MainColorsDark.ts`

### Animation Patterns (Framer Motion)

| Pattern | Technik | Datei |
|---------|---------|-------|
| Expand/Collapse | `AnimatedEaseInOut` (height 0→fit-content + opacity) | `twenty-ui/src/utilities/animation/components/AnimatedEaseInOut.tsx` |
| Modal Open/Close | Opacity fade mit AnimatePresence | `twenty-ui/src/layout/modal/components/Modal.tsx` |
| Submenu Chevron | 90° Rotation | `MenuItem.tsx` |
| Toggle Switch | Circular translate (x: 2→10px) | `Toggle.tsx` |
| Empty State Parallax | `useMotionValue()` + `useTransform()` cursor tracking | `AnimatedPlaceholder.tsx` |
| Card Body Expand | `AnimatedEaseInOut` mit 800ms debounced auto-collapse | `RecordBoardCard.tsx` |

**AnimatedEaseInOut Pattern (am häufigsten verwendet):**
```typescript
<AnimatePresence initial={false}>
  {isOpen && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'fit-content', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: theme.animation.duration.normal, ease: 'easeInOut' }}
    />
  )}
</AnimatePresence>
```

### Toast/Snackbar (Custom Implementation)

- **Kein Toast-Library** — vollständig custom (`SnackBar.tsx`, 262 Zeilen)
- Progress-Bar Background (Auto-Dismiss-Indikator)
- Varianten: default, error, success, info, warning mit spezifischen Icons
- Hover pausiert Progress-Animation
- Duration: 6000ms Default
- Action Button (z.B. Undo) + detailedMessage
- Mobile: 100% Breite, kein border-radius
- Desktop: 296px Breite, Glassmorphic (backdrop-blur)

### Skeleton Loaders

- Library: `react-loading-skeleton`
- Theme-Integration: `SkeletonTheme` mit `theme.background.tertiary` (base) + `theme.background.transparent.lighter` (highlight)
- Vordefinierte Höhen: `SKELETON_LOADER_HEIGHT_SIZES` für Konsistenz
- Kein Suspense — alle Loading States über Jotai State Management

### Dropdown/Overlay Positioning

- Library: `@floating-ui/react`
- Middlewares: `offset()`, `flip()` (auto-flip wenn off-screen), `size()` (verfügbarer Platz)
- Boundary Padding: left 12px, right 12px, bottom 48px (mobile) / 60px (desktop)
- Auto-Update bei Scroll/Resize

### Navigation/Sidebar

- Collapsible Drawer mit smooth Width-Transitions
- Tab-basierte Sektionen (Navigation Menu, Admin Panel)
- Workspace Switcher Dropdown
- Collapsible Groups mit Section Titles
- Badge Counts auf Nav Items
- Active Route Highlighting
- State: `isNavigationDrawerExpandedState` (Jotai)

### Click-Outside & Focus Management

- Data Attributes: `data-click-outside-id="dropdown-1"`, `data-globally-prevent-click-outside="true"`
- Prevents Dismissal bei verwandten UI-Elementen
- `@floating-ui/react` für Focus Trapping in Overlays

### Context Menu (Right-Click)

- Dropdown Component mit Click Handler
- `data-click-outside-id` für scoped Handling
- Actions registriert pro Record-Typ

---

## 11. UX Patterns für fertige Features — Konkrete Improvements

### Kanban Board (5.6) — 7 Improvements

| # | Improvement | Twenty-Pattern | Effort |
|---|-------------|---------------|--------|
| 1 | **Hover-Reveal Column Actions** | Menu + Create Button nur bei Header Hover sichtbar | S |
| 2 | **Sticky Header mit Column Borders** | `position: sticky; top: 0; z-index: 10;` + Border zwischen Spalten | S |
| 3 | **Multi-Drag Stack Preview** | Gestapelte Cards (bis 5) mit CSS z-index layering | M |
| 4 | **Aggregate Display Dropdown** | Wechselbares Aggregat (Count/Sum/Avg) im Column Header | M |
| 5 | **800ms Debounced Auto-Collapse** | Compact Mode Exit nicht instant, sondern debounced | S |
| 6 | **Data Attribute Styling** | `data-selected/focused/active` statt className-Jonglierung | S |
| 7 | **DnD Re-Render Breaker** | Memoization-Wrapper verhindert unnötige Card Re-Renders während Drag | S |

**Card State Styling (CSS Pattern):**
```css
&[data-selected='true'] { background-color: var(--accent-quaternary); }
&[data-focused='true']  { background-color: var(--background-tertiary); }
&[data-active='true']   { background-color: var(--accent-quaternary); border: 1px solid var(--color-blue7); }
&:hover                 { border: 1px solid var(--border-color-strong); }
.checkbox-container     { opacity: 0; transition: all ease-in-out 160ms; }
&:hover .checkbox-container, &[data-selected='true'] .checkbox-container { opacity: 1; }
```

### Data Table (MyJobsTable) — 6 Improvements

| # | Improvement | Twenty-Pattern | Effort |
|---|-------------|---------------|--------|
| 1 | **Sticky Header** | Position sticky, z-index control, visueller Separator | S |
| 2 | **Read-Only Cell Styling** | Subtiler Outline bei Hover für read-only Cells | S |
| 3 | **Floating UI Cell Editor** | `@floating-ui/react` für inline Edit mit smart Positioning + flip() | M |
| 4 | **Cell Position Attributes** | `data-record-table-row/col` für Keyboard Navigation | S |
| 5 | **Column Resize** | `useResizeTableHeader()` Hook mit Drag Handle | M |
| 6 | **Dekorative letzte Spalte** | Leere Spalte am Ende für visuelles Gleichgewicht | S |

### Automation Wizard (2.10) — 5 Improvements

| # | Improvement | Twenty-Pattern | Effort |
|---|-------------|---------------|--------|
| 1 | **Click-to-Expand Settings** | Klick auf Feld expandiert inline Settings Panel (kein Modal) | M |
| 2 | **Drag-Reorder Fields** | `@hello-pangea/dnd` für Field-Reihenfolge mit Grip Handle | M |
| 3 | **Debounced Auto-Save** | 1s Debounce bei blur/drag-end (nicht per Keystroke) | S |
| 4 | **Readonly Dual Mode** | Komplett anderes DOM für readonly vs edit (nicht nur disabled) | S |
| 5 | **Progressive Disclosure** | Settings unter Feld versteckt, nur bei Selection sichtbar | S |

### Settings Pages — 6 Improvements

| # | Improvement | Twenty-Pattern | Effort |
|---|-------------|---------------|--------|
| 1 | **SettingsPageContainer** | Feste Breite Desktop, volle Breite Mobile, Scroll Restoration | S |
| 2 | **Section + H2Title** | `<Section>` mit `H2Title` + Beschreibung für Struktur | S |
| 3 | **Autosave mit 500ms Debounce** | Optimistic Local State + Mutation mit Debounce | S |
| 4 | **Cleanup on Unmount** | `debouncedUpdate.cancel()` im useEffect Cleanup | S |
| 5 | **Extra Bottom Padding** | `spacing[20]` Padding unten für angenehmes Scrolling | S |
| 6 | **Scroll Restoration per Page** | Scroll Position pro Settings-Seite merken | M |

---

## 12. UX Patterns für offene ROADMAP Items

### 2.1 Onboarding Wizard

Twenty hat einen vollständigen Onboarding Flow:
- **Steps:** CreateWorkspace → CreateProfile → SyncEmails → InviteTeam → BookCall
- **Pattern:** Separate Page-Components pro Step, `useSetNextOnboardingStatus()` Hook
- **Skip-Logic:** Feature-Flag-basiert (z.B. `isAccountSyncEnabled`), Workspace-Member-Count
- **Forms:** react-hook-form + Zod Validation
- **Keyboard:** Enter-Key submitted via `useHotkeysOnFocusedElement`
- **Loading Feedback:** 3-Stage Loader ("Setting up database" → "Creating data model" → "Prefilling")
- **UI:** Zentriertes Modal, Logo/Avatar Upload, OAuth Buttons für Email Sync

### 2.6 Input Fields

Twenty hat **46 Field-Type-Renderer** in `record-field/ui/meta-types/input/`:
- Text, Number, Currency (Amount + Code Selector), Date, DateTime
- **FullName** (Composite: DoubleTextInput mit firstName + lastName, Paste-Splitting)
- Select, MultiSelect, Boolean (Toggle), Rating (Stars)
- **Emails/Phones** (Listen mit Validation), Links (URL Liste), Address (Composite)
- Files (Attachment Upload), RichText (BlockNote Editor), RawJson (JSON Editor)
- Relation (Record Relations mit Search)

**Pattern:** `FieldInputEventContext` für onEnter/onEscape/onClickOutside/onTab/onShiftTab — entkoppelt Input-Logik vom Container.

### 2.16 Keyboard Shortcuts

- Library: `react-hotkeys-hook` mit custom Wrappers
- `useGlobalHotkeys()` — Global (Cmd+K, Shift+?)
- `useHotkeysOnFocusedElement()` — Scoped per Focus-ID (Escape in Side Panel)
- Shortcuts: Cmd+K (Command Menu), Shift+? (Shortcut Liste), / (Search), @ (AI), Escape (Back)
- **Konflikt-Vermeidung:** `enableOnFormTags: false` verhindert Auslösung in Inputs
- **Shortcut Display:** Dialog mit gruppierten Shortcuts (General, Table), Plattform-Symbole (⇧⌘)

### 2.19b Loading UX

- `react-loading-skeleton` mit Theme-Farben (nicht custom Shimmer)
- Skeleton Loaders: `SettingsSkeletonLoader`, `WidgetSkeletonLoader`, `RecordTableCellSkeletonLoader`
- `AnimatedPlaceholder` für Empty States (SVG + Parallax Cursor-Tracking)
- **Kein Suspense** — alle Loading States über Jotai Atoms

### 2.20 Command Palette (Cmd+K)

- Side Panel Pattern (nicht zentrales Modal wie cmdk)
- Cross-Object Search via GraphQL mit `tsRankCD` + `tsRank` Ranking
- Cursor-basierte Pagination
- Mobile: Full-Screen Variante
- Keyboard: Arrow Keys navigieren, Enter selektiert, Escape schließt
- Sub-Pages: Records, Workflows, AI
- Framer Motion Slide-In Animation

### 2.5 Kartenansicht

- **Twenty hat KEINE Karten-Visualisierung** — nur `PlaceAutocompleteSelect` (Google Places Autocomplete)
- Location-Daten als Autocomplete-Selections gespeichert, kein Mapbox/Leaflet

### 2.12 UI Tour / 2.17 Browser Extension

- **Nicht in Twenty implementiert** — keine driver.js/react-joyride, keine Chrome Extension

### 2.18 Analytics

- **Dashboard-Widget-Framework** vorhanden, aber keine Charts/Visualisierung
- Nur Event Tracking (`useEventTracker()`)

---

## 13. Konto-Synchronisierung & Authentifizierung

### Unterstützte Account-Typen (ConnectedAccountProvider)

| Provider | Zweck | OAuth Scopes |
|----------|-------|-------------|
| **Google** | Gmail + Calendar | gmail.readonly, gmail.send, gmail.compose, calendar.events, profile.emails.read |
| **Microsoft** | Outlook + Teams Cal | Mail.ReadWrite, Mail.Send, Calendars.Read, offline_access |
| **IMAP/SMTP/CalDAV** | Self-hosted Mail+Cal | Kein OAuth — Username/Password + TLS |
| **OIDC** | Enterprise SSO | openid, email, profile (PKCE S256) |
| **SAML 2.0** | Enterprise SSO | X.509 Cert Validation, SHA-256 Signatur |

### Authentifizierungs-Architektur

**5 Login-Methoden:** Email+Password, Google OAuth, Microsoft OAuth, OIDC, SAML 2.0
**JWT Token System:** 11 Token-Typen (Access 15min, Refresh 7d, API Key, File, App, etc.)
**Secret Derivation:** `SHA256(APP_SECRET + workspaceId/userId + tokenType)` — pro Workspace/User unique
**Refresh Grace Period:** 10s Toleranz für parallele Browser-Tabs

### Token-Sicherheit (Flashlight-Findings)

| Aspekt | Twenty Implementation | Risiko | JobSync Vergleich |
|--------|----------------------|--------|-------------------|
| **OAuth Token Storage** | **Plaintext** in PostgreSQL | **HOCH** | JobSync: AES-256-GCM verschlüsselt — **BESSER** |
| **JWT Signing** | SHA256-derived per-workspace Keys | Mittel | JobSync: AUTH_SECRET + per-record Salt — ähnlich |
| **Token Revocation** | DB-backed mit JTI + Grace Period | Niedrig | JobSync: Kein JTI-Tracking — Twenty besser |
| **CSRF Protection** | State Parameter + Domain Validation + SameSite=lax | Niedrig | JobSync: Next.js Server Actions CSRF built-in |
| **Rate Limiting Auth** | **NICHT implementiert** | **HOCH** | JobSync: Sliding Window auf signin/signup — **BESSER** |
| **Impersonation** | JWT Claims + Audit Trail | Niedrig | JobSync: Nicht implementiert |
| **TOTP/2FA** | AES-256-CBC verschlüsselt | Niedrig | JobSync: Nicht implementiert |
| **Password Hashing** | bcrypt (10 rounds) | Niedrig | JobSync: NextAuth default — ähnlich |
| **Encryption Algorithm** | AES-256-CTR (für Secrets Service) | Niedrig | JobSync: AES-256-GCM + PBKDF2 — **BESSER** (authentifiziert) |

**Kritische Erkenntnis:** Twenty speichert OAuth Tokens **unverschlüsselt**. JobSync's `encrypt()` mit AES-256-GCM + per-record Salt + PBKDF2 Key Derivation ist signifikant sicherer. Bei ROADMAP 1.7/1.12 dürfen wir Twenty's Plaintext-Ansatz **nicht** übernehmen.

### IMAP/SMTP/CalDAV Self-Hosted Pfad (für ROADMAP 1.7 + 1.12)

**Libraries:**
| Library | Version | Zweck |
|---------|---------|-------|
| `imapflow` | 1.2.1 | IMAP Client mit QRESYNC Support |
| `nodemailer` | ^8.0.4 | SMTP Senden |
| `postal-mime` | ^2.6.1 | RFC 5322 MIME Parser |
| `tsdav` | ^2.2.0 | WebDAV/CalDAV Client |
| `node-ical` | ^0.20.1 | iCalendar VEVENT Parser |
| `digest-fetch` | ^3.1.1 | HTTP Digest Auth (RFC 7616) |
| `planer` | 1.2.0 | Email Quote Extraction |

**IMAP Sync-Strategie:**
1. QRESYNC (RFC 7162) wenn verfügbar — inkrementell via modSeq
2. Fallback: UIDVALIDITY + highestUid Tracking — full re-fetch bei Invalidation
3. Mailbox Lock (`client.getMailboxLock()`) für serialisierten Zugriff
4. Self-signed Certs erlaubt (`rejectUnauthorized: false`) + SSRF Validation

**CalDAV Sync-Strategie:**
1. Bevorzugt: RFC 6578 `syncCollection` mit syncToken (inkrementell)
2. Fallback: CTag + ETag Polling wenn syncCollection nicht unterstützt
3. Dual-Auth: Basic Auth initial + Digest Auth Fallback bei 401
4. iCalendar Parsing: VEVENT → Titel, Beschreibung, Location, Start/End, Attendees (PARTSTAT)

**Message Parsing Pipeline:**
```
Raw MIME Source (Buffer)
  → postal-mime.parse() → Headers, From/To/CC/BCC, text/html body, Attachments
  → planer.extractFrom() → Text ohne Reply-Zitate
  → formatAddressObjectAsParticipants() → MessageParticipant[] mit Rollen
```

### Enterprise SSO (für ROADMAP 1.9 arbeitsagentur.de)

**OIDC Flow (Keycloak-kompatibel):**
```
GET /auth/oidc/login/:identityProviderId
  → Redirect zu IdP mit PKCE (S256) + State Parameter
  → User authentifiziert sich
  → Callback: /auth/oidc/callback?code=...&state=...
  → openid-client validiert ID Token
  → Claims: email, given_name, family_name
  → Auto-Provisioning wenn approvedAccessDomain matched
```

**Workspace Isolation:** Schema-per-Workspace in PostgreSQL (`workspace_<base36-uuid>`)
**Multi-IdP:** Mehrere OIDC/SAML Provider pro Workspace möglich
**Domain Verification:** `ApprovedAccessDomainEntity` — Admin verifiziert Domain, dann Auto-SSO
**User Provisioning:** Automatisch bei erstem SSO Login (kein manuelles Approval)

**Relevanz für arbeitsagentur.de (ROADMAP 1.9):**
- arbeitsagentur.de nutzt Keycloak (Realm `OCP`, Client `profil-online`)
- Twenty's OIDC-Implementation mit PKCE ist direkt kompatibel
- Der OIDC Discovery-Flow (`.well-known/openid-configuration`) funktioniert mit Keycloak
- JobSync bräuchte: `ConnectedAccount` Entity + OIDC Strategy + Token Refresh

### Sync-Pipeline (4 Stufen)

```
1. Verbinden    → OAuth/IMAP Credentials → ConnectedAccount Entity
2. Channel      → MessageChannel + CalendarChannel erstellen (syncStage: PENDING_CONFIGURATION)
3. Initial Sync → BullMQ Job: List Fetch → Import (2-Phase State Machine)
4. Inkrementell → Sync Cursor (Gmail historyId / IMAP UIDVALIDITY / CalDAV syncToken)
```

**Token Refresh:** Automatisch vor jedem Sync-Job (1h Buffer, 5min Grace)
**Revocation Detection:** `authFailedAt` wird gesetzt → UI zeigt "Erneut verbinden"
**Multi-Account:** Ein User kann mehrere Google/Microsoft-Konten verbinden
**Email Aliases:** Automatisch erkannt via Google People API / Microsoft Graph proxyAddresses

---

## File Path Summary
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/activities/timeline-activities/`

### Detail Pages
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/page-layout/`

### Workflow
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/workflow/workflow-diagram/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/workflow/`

### Calendar
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/object-record/record-calendar/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/calendar/`

### Email/Messaging
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/activities/emails/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/messaging/`

### View System
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/views/`
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/object-record/record-table/`
`/home/pascal/projekte/twenty/packages/twenty-front/src/modules/object-record/record-board/`

### Architecture
`/home/pascal/projekte/twenty/packages/twenty-server/src/engine/`
`/home/pascal/projekte/twenty/packages/twenty-shared/src/`
`/home/pascal/projekte/twenty/packages/twenty-ui/src/`

### Auth & SSO
`/home/pascal/projekte/twenty/packages/twenty-server/src/engine/core-modules/auth/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/engine/core-modules/sso/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/engine/core-modules/api-key/`

### Connected Accounts & Token Management
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/connected-account/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/connected-account/refresh-tokens-manager/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/connected-account/email-alias-manager/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/connected-account/oauth2-client-manager/`

### IMAP/SMTP/CalDAV
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/messaging/message-import-manager/drivers/imap/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/messaging/message-import-manager/drivers/smtp/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/messaging/message-outbound-manager/drivers/imap/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/modules/calendar/calendar-event-import-manager/drivers/caldav/`
`/home/pascal/projekte/twenty/packages/twenty-server/src/engine/core-modules/imap-smtp-caldav-connection/`
