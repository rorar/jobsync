# Database Implementation: Manifest-Driven AutomationWizard

## Changes Made

### Schema
- Added `scheduleFrequency String @default("daily")` to Automation model in `prisma/schema.prisma`
- Migration: `prisma/migrations/20260329193149_add_schedule_frequency/migration.sql`

### Data Migration
- Created `scripts/migrate-schedule-frequency.ts` — extracts scheduleFrequency from connectorParams JSON, writes to new column, cleans JSON

### Server Actions (`src/actions/automation.actions.ts`)
- `createAutomation`: writes `scheduleFrequency` to Automation record directly
- `updateAutomation`: recalculates `nextRunAt` when scheduleFrequency changes
- `resumeAutomation`: **BUG FIX** — now passes `automation.scheduleFrequency` to `calculateNextRunAt` (previously always defaulted to "daily")

### Runner (`src/lib/connector/job-discovery/runner.ts`)
- Reads `automation.scheduleFrequency` directly instead of parsing connectorParams JSON

### Scheduler + API Route
- Both pass `scheduleFrequency` to `runAutomation()` call object

### Models
- `automation.model.ts`: added `scheduleFrequency: string`
- `automation.schema.ts`: added `scheduleFrequency` to Zod schema with `z.enum(["6h", "12h", "daily", "2d", "weekly"]).default("daily")`

### Test Fixtures
- All 5 Automation fixtures updated with `scheduleFrequency` values

## Verification
- 72 suites, 1503 tests passed
- Build: zero type errors
