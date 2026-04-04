# Review Scope

## Target

S3 CRM Core — Job Status Workflow (5.3) + Kanban Board (5.6). All files created or modified during Session S3 (commits 1c4a500..cee3b4c).

## Files

### Core CRM Logic
- src/lib/crm/status-machine.ts
- src/lib/events/event-types.ts
- src/lib/events/index.ts
- src/models/actionResult.ts

### Server Actions (Job Aggregate Repository)
- src/actions/job.actions.ts

### Kanban UI Components
- src/components/kanban/index.ts
- src/components/kanban/KanbanBoard.tsx
- src/components/kanban/KanbanCard.tsx
- src/components/kanban/KanbanColumn.tsx
- src/components/kanban/KanbanEmptyState.tsx
- src/components/kanban/KanbanViewModeToggle.tsx
- src/components/kanban/StatusTransitionDialog.tsx

### Kanban State Hook
- src/hooks/useKanbanState.ts

### Jobs Container (Integration)
- src/components/myjobs/JobsContainer.tsx

### i18n
- src/i18n/dictionaries/jobs.ts
- src/i18n/dictionaries.ts

### Schema + Seed
- prisma/schema.prisma
- prisma/seed.ts

### Scheduler Integration
- src/lib/scheduler/run-coordinator.ts

### Shared Utilities
- src/lib/automation-display-keys.ts
- src/lib/format-duration.ts
- src/lib/utils.ts

### Settings/Admin Components (S2 deferred fixes)
- src/components/settings/AiSettings.tsx
- src/components/settings/ApiKeySettings.tsx
- src/components/settings/AutomationSettings.tsx
- src/components/settings/DeveloperSettings.tsx
- src/components/settings/DisplaySettings.tsx
- src/components/settings/ErrorLogSettings.tsx
- src/components/settings/NotificationSettings.tsx
- src/components/admin/AddCompany.tsx

### Automation Components (S2 deferred fixes)
- src/components/automations/AutomationList.tsx
- src/components/automations/AutomationMetadataGrid.tsx
- src/components/automations/RunHistoryList.tsx
- src/components/automations/RunStatusBadge.tsx
- src/components/scheduler/SchedulerStatusBar.tsx
- src/app/dashboard/automations/[id]/page.tsx

### Profile Components (S2 deferred fixes)
- src/components/profile/AiJobMatchResponseContent.tsx
- src/components/profile/AiResumeReviewResponseContent.tsx

### Tests
- __tests__/automation-display-keys.spec.ts
- __tests__/crm-actions.spec.ts
- __tests__/format-duration.spec.ts
- __tests__/job.actions.spec.ts
- __tests__/JobsContainer.spec.tsx
- __tests__/RunHistoryList.spec.tsx
- __tests__/RunStatusBadge.spec.tsx
- __tests__/SchedulerStatusBar.spec.tsx
- __tests__/status-machine.spec.ts

### E2E Tests
- e2e/crud/kanban.spec.ts

### Allium Specs
- specs/crm-workflow.allium
- specs/job-aggregate.allium

## Flags

- Security Focus: yes
- Performance Critical: no
- Strict Mode: yes
- Framework: Next.js 15 (App Router)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report

## Key Context

- DDD principles: Job Aggregate boundary, state machine pattern, domain events
- IDOR enforcement: All Prisma queries MUST include userId (ADR-015)
- i18n: All UI strings translated to EN/DE/FR/ES
- Existing S3 review (docs/reviews/s3/comprehensive-review.md): 3 HIGH, 9 MEDIUM, 7 LOW — 13 fixed, 10 deferred
- S3 deferred items: 4 HIGH (state machine bypass via API/edit, optimistic locking, reorder no-op)
