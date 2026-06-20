# Spotlight / Command Palette (ROADMAP 2.20) — Design Research

**Date:** 2026-06-20 · **Status:** Research complete, pre-spec (no code, no `spotlight.allium` yet)
**Scope:** ROADMAP 2.20 Spotlight (Cmd+K palette) + its children (navigation / search / actions / AI-bridge / voice / inline-create) + references
**Method:** Understand-Anything graph (HEAD-current for this question) + code grep + 3 parallel deep-review subagents over cloned reference repos
**Reference repos** (cloned to `/home/pascal/projekte/`): `twenty` (Command Menu), `cmdk`, `kbar`, `kmenu`, `react-command-palette`, `cmd-dialog`, `reablocks`, `astro-command-palette`, `raycast-nuxt-ui-clone`, `dotdotduck`

> **Numbering note:** "2.20 Spotlight" is the historically-anchored number. The former duplicate "2.20 CompanyDetail Page" was renumbered to **2.21** (commit `758185f`).

---

## Original questions (verbatim, as asked)

`````text
Open points - have an inner dialog with extra long thinking and answer one by one: 
0. Is the code ready for the implementation? -> All APIs connectable and does the data flow? ( Discover + /understand-chat + /understand-domain )
1. Is there a plan to use a prebuilt component? If yes, which one fits best?
Examples (for deep project scan + review `git clone` them to @/home/pascal/projekte/ - `gh` auth is @rorar )
- @/home/pascal/projekte/twenty/ also got "Command Menu" + Understand Aynthing Graph
Output from another agent (surface):
```
Twenty ships a full Cmd+K command palette — its Spotlight. It's a first-class subsystem (228 nodes), spanning frontend UI, a backend full-text search, and configurable per-object menu
  items.

  Frontend palette — twenty-front/src/modules/command-menu/

  - Hotkeys — hooks/useCommandMenuHotKeys.ts: ⌘/Ctrl+K toggle, / search records, @ AI assistant, Esc back, Backspace navigate sub-pages.
  - Shell — components/CommandMenuOpenContainer.tsx, CommandMenu.stories.tsx, CommandMenuButton.tsx, mobile variant CommandMenuForMobile.tsx. Item widgets: CommandMenuItem,
  …ItemDropdown/TextInput/NumberInput/Toggle.
  - Search wiring — graphql/queries/search.ts + constants/MaxSearchResults.ts.
  - Layers: Frontend Feature Modules + Frontend UI & Display.

  Backend search — twenty-server/src/engine/core-modules/search/

  - dtos/search-record.dto.ts (SearchRecordDTO), dtos/object-record-filter-input.ts (ObjectRecordFilterInput).
  - Postgres full-text: object-record/constants/SearchVectorFieldName.ts (tsvector searchVector field) + DefaultSearchRequestLimit.ts. Frontend hook
  object-record/hooks/useObjectRecordSearchRecords.ts → RecordGqlOperationSearchResult.

  Configurable menu items — command-menu-item (two sides)

  - Backend metadata module engine/metadata-modules/command-menu-item/ — entity, resolver, service, DTOs, exception interceptor. Per-object actions are metadata, migrated via
  workspace-migration handlers (create/update/delete) + permission gating (GateExportImportCommandMenuItemsByPermissionFlagCommand).
  - Frontend modules/command-menu-item/ — context-specific palettes: RecordIndexCommandMenu, RecordShowCommandMenu, RecordPageSidePanelCommandMenu, StandalonePageCommandMenu.

  Related but separate

  advanced-text-editor/extensions/slash-command/SlashCommandMenu.tsx — Notion-style / block menu inside the rich-text editor, not the global palette.

  TL;DR: global ⌘K palette = command-menu module → tsvector search in core-modules/search; surfaced actions = metadata-driven command-menu-item. No node literally named "spotlight/cmdk" (0
  matches) — Twenty calls it Command Menu.

```
- https://github.com/dip/cmdk
- https://github.com/timc1/kbar
- https://github.com/haaarshsingh/kmenu
- https://github.com/reaviz/reablocks (component library - also stepper useful for crm https://reablocks.dev/docs/components/layout/stepper)
- https://github.com/asabaylus/react-command-palette
- https://github.com/pauchiner/astro-command-palette
- https://github.com/HugoRCD/raycast-nuxt-ui-clone
- https://github.com/OzzyCzech/cmd-dialog
2. Have you thought on the ROADMAP.md File Manager feature and how to integreate it with the Spotlight component?
3. How would you solve the AI-Bridge and Voice Input?
Example (project deep scan [as features on the surface not obvious] + review):
- https://github.com/PerhapxinLab/dotdotduck
4. How would you implement the Spotlight seen through the eyes of the project rules? (Connector / Module / How both hooks into the Spotlight)
5. Is there any refactoring needed?
`````

> **Clone note:** the actual clones used canonical/working URLs where the listed ones differed — `pacocoursey/cmdk` (for `dip/cmdk`), `harshhhdev/kmenu` (for `haaarshsingh/kmenu`). All 9 reference repos cloned successfully to `/home/pascal/projekte/`.

The numbered sections below (0–5) answer these one-by-one.

---

## TL;DR — decisions

- **Component:** Build on **cmdk** (already a dependency; shadcn `CommandDialog` already present, unused). Add **no** new palette dependency. Write a thin native **Action-Registry** modelled on kbar's `Action` shape.
- **Architecture:** Spotlight is an **app-layer Action-Registry + Search surface** — **neither a Connector nor a Module**. It *consumes* the AI-Provider Connector (for the AI-bridge) and *aggregates* Module-contributed actions (manifest-driven, mirroring the existing Widget-Registry).
- **Search:** single SQLite **FTS5** table (`entityType` column + `bm25()` rank + prefix + `LIKE` fallback), own minimized projection `{id, entityType, label, icon, rank}`, `userId`-scoped.
- **AI-bridge:** structured-envelope tool-calling over the same registry via `AIProviderConnector.createModel()` (AI SDK), opaque-ID args (PII-free by construction), sensitivity router → local Ollama for PII, `@/lib/pii` redaction before any cloud egress, confirm-gate.
- **Voice:** local-first STT (Web Speech v1 / `whisper-wasm` module for true zero-egress) + opt-in cloud-STT fallback Module; transcript cleanup on local Ollama.
- **Spec:** thin domain-core only (Action-Registry contract + same-auth + search ownership/minimization + AI redaction invariants). The cmdk/keyboard/ranking mechanics are out-of-scope UI infra (per the 2.16 "Pure UI-Infrastruktur, kein Allium-Spec nötig" precedent).

---

## 0. Is the code ready for implementation? (APIs connectable + data flows?) — PARTIAL, core tiers buildable now

| Tier | Ready? | Evidence |
|---|---|---|
| **Navigation** ("go to X") | Yes | Pure routing over existing pages — no domain dependency. |
| **Action invocation** | Mostly | `addJob`, `runAutomation` (via `runCoordinator.requestRun`), status changes, etc. all exist as auth'd, IDOR-scoped server actions returning `ActionResult` → the palette is just another caller, data flows. **Exception:** "Export CV/doc" actions are **not built** (cv-document 4.2 is DRAFT). |
| **Cross-entity search** | Fan-out only | Per-entity list/query actions exist (`getAllJobs/Companies`, `getPersons`, `getAutomations`, `getDiscoveredJobs`, `getStagedVacancyList`, `listReferrals`…). **No unified search, no FTS5.** Buildable now via fan-out; FTS5 is the clean target (see §search). |
| **AI-bridge** | Plumbing ready | `AIProviderConnector.createModel()` returns an AI-SDK `LanguageModel` → native `generateText({tools})`. Ollama/OpenAI/DeepSeek modules exist. |
| **Palette shell** | Present, unwired | cmdk is a dependency; `CommandDialog` exists in `src/components/ui/command.tsx`, **unused**. No Cmd+K binding, no Action-Registry. |

**Verdict:** data flows for navigation + actions + AI-bridge on current code. Search works via fan-out today; FTS5 is the production target. Missing infra to *build* (not blockers): the Action-Registry, the palette wiring, the unified-search layer. Doc-export actions are gated on cv-document 4.2.

## 1. Prebuilt component — build on cmdk; add no new palette dependency

**Verdict:** cmdk = the rendering/scoring primitive (already shipped); write a thin native Action-Registry on top. Reject kbar / kmenu / react-command-palette as dependencies.

| Lib | Verdict | Why |
|---|---|---|
| **cmdk** (`^1.0.0`, `package.json:65`; unused `CommandDialog` in `ui/command.tsx`) | **Build on** | Canonical shadcn `Command` primitive, Radix-aligned, Tailwind via data-attrs, React-19-tested, headless, ~few KB. Zero new dep. |
| **kbar** | dep ✗ / pattern ✓ | React-16/17-pinned, perma-beta (`0.1.0-beta.47`), React-19 untested, ships its own positioner/animation (fights Radix + tokens). **Mirror its Action model natively.** |
| **kmenu** (modern rewrite) | dep ✗ / pattern ✓ | Cleanest design but a redundant second primitive. **Steal its async-action protocol.** |
| **react-command-palette** | ✗ | class-component + react-autosuggest + react-modal + mousetrap, bot-maintained. Dead end. |
| **cmd-dialog** | ✗ | Lit web-component, vanilla-only. |
| **reablocks** | ✗ for palette | Whole component lib — don't adopt for a palette. Its **Stepper** is only a *CRM-UI reference* (separate concern). |

**Build natively (what cmdk lacks):** a global **Action-Registry** mirroring kbar's `Action` shape — `{id, name, shortcut, keywords, section, icon, priority, parent, perform}` — backed by a **flat id-keyed store with id-based parent linking** + a `useRegisterActions`-style **mount/unmount lifecycle** so manifest-driven modules contribute/retract actions cleanly. The flat-store-linked-by-id maps directly onto the existing Widget-Registry pattern.

**Division of labour:**
- **cmdk owns:** view, `commandScore` fuzzy matching, DOM-authoritative filtering, `<Command.Loading>`/`forceMount` async UX, **pages stack** for nesting.
- **JobSync owns:** the registry + **composite ranking** (cmdk fuzzyScore **+** kbar's explicit `priority`, grouped/ordered by `section` — `kbar useMatches.tsx:122-167`), dispatch into the Widget-Registry, `shouldFilter={false}` for server-ranked cross-entity search.
- **Async/AI seam (from kmenu):** overloaded action return `() => void | Promise<void> | CommandOption[]` (`kmenu core.ts:811-829`) — one union unifies sync-action / nav-into-subpage / async-fetched-subitems. Clean hook for "type query → async fetch → become sub-page" and the future AI-bridge.

## 2. File Manager (ROADMAP 2.8) + Spotlight integration

2.8 = Dateiexplorer (organize/rename/delete Bewerbungsunterlagen); the File Explorer lives alongside logo-asset in `src/lib/assets` (CLAUDE.md); EP-2 = "LogoAsset as searchable asset in File Explorer."

**Integration requires no special coupling.** A File is just **another searchable entity-type + action-provider** in the registry:
- **Search tier:** files (resumes, documents, logos) indexed → "find resume_v2.pdf" surfaces in cross-entity results.
- **Action tier:** "Open resume", "Attach file to Job X", "Upload" = Action-Registry entries.
- **Payoff of the manifest-driven Action-Registry:** File Manager self-registers its searchables + actions and plugs into Spotlight with **zero Spotlight code change** — exactly how new modules plug into the AutomationWizard via manifests. 2.8 and 2.20 are independent; whichever ships first, the other extends it. **Spotlight should define the searchable + action registry contract so File Manager can target it.**

## 3. AI-Bridge + Voice Input

### AI-Bridge (NL → action)

Reuse the existing AI-Provider Connector; the AI just selects Action-Registry entries the user could have clicked. **One registry, two front-ends (manual palette + AI).**

- **Mechanism = structured-envelope forced single tool-call** (dotdotduck's `agent_turn`: `{memory, planning, actions[], is_final}`), **not** native per-tool function-calling. This matters because JobSync's GDPR default is **Ollama (local)**, whose tool-calling is weaker/variabler than OpenAI's — structured-output-via-prompt-schema is **model-portable**. Property order is load-bearing (`actions` before `is_final`).
- **Action-Registry = the tool catalog.** Each action = `{name, description, JSON-schema params, handler, requireConfirmation, sensitivity}`. Rendered into the prompt; the LLM picks by name. Same registry as §1/§4.
- **Grounding via opaque IDs (the key idea).** dotdotduck grounds in a hashed DOM index to kill selector hallucination; JobSync analog: action args = **opaque entity IDs** (`jobId`/`companyId`/`personId`), never PII → **action arguments are PII-free by construction** (a structural GDPR win). The registry supplies the ID↔label map.
- **Role router → AiModuleId selection.** Roles: `bridge` (NL→action), `utility` (transcript cleanup). **Sensitivity-aware routing:** free-text PII in prompt/args → force local Ollama; fall to cloud only after `@/lib/pii` redaction.
- **GDPR gap dotdotduck does NOT cover (net-new for JobSync):** its only "redaction" hides the API key (ProxyProvider) — no cloud-egress free-text PII redaction, no sensitivity routing. The AI-bridge is a **4th AI-egress sink** → it MUST source redaction from `@/lib/pii` (the `CloudTransferDataMinimization` invariant). Build a **sensitivity-routing + redaction middleware** between the envelope-builder and the Connector. Reuses the existing leaf.
- **Confirm-gate** (`requireConfirmation` + `ask_user_choice`) = the visible redaction-and-consent checkpoint: before any cloud-bound free-text, redact + show-what-will-be-sent. Turns the GDPR rule into an enforced runtime gate.

### Voice Input

- **Pattern:** Web Speech API primary + host `transcribe(blob)` fallback + `transcribeMode: 'fallback'|'always'` switch = the local-vs-cloud STT choice.
- **GDPR-correct for JobSync** (Web Speech is privacy-*improving* but NOT zero-egress — Chrome/Edge stream audio to Google/MS, Safari→Apple):
  - **v1:** browser Web Speech (pure-client, no module) — fast; document the Chrome→Google caveat.
  - **GDPR-true:** a local `whisper-wasm` **Module behind a new `speech-to-text` Connector** (genuine on-device, mirrors the Ollama-default philosophy); cloud-STT (Whisper API) = opt-in fallback Module.
- **Critical routing:** run transcript **cleanup on local Ollama** (raw transcript = highest-PII free text; never leaves before redaction). Flow: hold-Space → capture → cleanup(local) → [redact if cloud] → if focused-in-input: fill; else: feed AI-bridge as task.
- **Hardening to steal:** `warmUp()` (pre-pay mic permission off the gesture critical path), `autoRestartOnEnd` (mobile silence auto-stop), `captureTimeoutMs` failsafe.

**Spec-worthy core (point 3):** only the boundary — the sensitivity/redaction invariant + the same-auth invariant. The envelope mechanics + STT engine are implementation/black-box.

## 4. Spotlight through the project rules (Connector / Module / how both hook in)

**Spotlight is NEITHER a Connector NOR a Module.** Ubiquitous Language: Connector = ACL for *external* systems; Module = external system behind a Connector. Spotlight has no external API → it is an **app-layer UI surface + an Action-Registry** (manifest-driven, mirrors the `WidgetRegistryLookup` invariant in `automation-wizard.allium`). Twenty's command-menu is the proof-of-pattern.

- **Registry = declarative `CommandDescriptor[]` + `Record<handlerId, handler|component>` dispatch map** (Twenty's `EngineComponentKeyHeadlessComponentMap` + `CommandRunner` render `map[ctx.key]`, zero per-module `if`). This is the Widget-Registry pattern applied to actions. For single-user JobSync: a **static in-code array** (no DB table; avoid Twenty's multi-tenant seeding/migration machinery).
- **Gating = typed predicates against one runtime context** `{pageType, permissionFlags, isAdmin, selectionCount, userId}`. Gating is data, not branching. **Avoid Twenty's string-DSL + eval sandbox** — use plain `(ctx) => boolean` TS predicates (type-safe, no parser dep, no silent catch-false). **The security invariants live here:** admin-gated actions carry an `isAdmin` predicate (no palette privilege-bypass); entity results carry `userId` scope (ADR-015 IDOR).
- **Modules hook in two ways:** (1) **contribute descriptors** — a Module manifest declares `paletteActions[]`, registered via a `useRegisterActions`-style mount/unmount lifecycle (matches Module activation); (2) **the AI-Provider Connector powers the `@` bridge** — but the palette is only a **launcher** (Twenty's `@` just navigates to the AI page; AI is its own module).
- **Tool-calling steal:** Twenty's **tool-provider registry with lazy-schema-loading** (slim catalog → hydrate schemas on demand) keeps Ollama's small context lean.

→ **Spotlight = app-layer Action-Registry + Search surface that CONSUMES the Connector registry (AI-Provider for the bridge, Module manifests for contributed actions); neither Connector nor Module.**

### Search backend (closes 0 / 5)

Twenty = per-entity fan-out + minimized DTO + app-side re-rank + LIKE-fallback. **SQLite port:** a **single shared FTS5 table** (`entityType` column + `bm25()` rank + `term*` prefix + `LIKE` fallback on zero rows) — simpler than N-table fan-out; single-user → plain `LIMIT/OFFSET` (skip rank-cursor pagination). **Result = dedicated minimized projection `{id, entityType, label, icon, rank}`.**

## 5. Refactoring needed? — one minor prereq (corrected)

- **Wire the unused `CommandDialog`** (`src/components/ui/command.tsx`) as the palette base. Minor.
- **Build the FTS5 index.** New infra, not a refactor.
- **ADR-019 select-hygiene sweep — NOT a hard prereq (corrected by the Twenty review).** Earlier reasoning assumed search would fan out over the leaky `getAll*` reads. Twenty's lesson: search uses its **own minimized DTO query** (`{id, type, label, rank}`), not the entity-list actions. So a dedicated search projection sidesteps the prereq. The select-hygiene sweep remains independently good hygiene but does **not** block Spotlight.
- **Optional:** event-payload enrichment (blind-spot #18 — `JobStatusChanged` lacks title/company) — only if event-driven indexing is chosen; avoid via query-based indexing.
- **Aligned (not blocking):** the §G combobox consolidation + the BaseCombobox slivers (`is_loading_options` / `TriggerHasAccessibleName`, committed this session) support the picker inline-create.

---

## Consolidated architecture

```
Spotlight (app-layer, Cmd+K)  — neither Connector nor Module
├─ Shell: cmdk CommandDialog (already shipped) + pages-stack nesting
│         + focus-scoped hotkeys (⌘K / "/" search / "@" AI / Esc / empty-Backspace)
├─ Action-Registry: static CommandDescriptor[] + Record<handlerId,handler> dispatch
│         (mirrors Widget-Registry; modules contribute via manifest.paletteActions[];
│          gating = typed (ctx)=>bool predicates carrying admin + userId scope)
├─ Ranking: cmdk commandScore (fuzzy) × kbar priority+section ordering
├─ Search "/": single FTS5 table → {id,type,label,icon,rank} minimized DTO
│         (own projection, userId-scoped; LIKE fallback; LIMIT/OFFSET)
├─ AI-bridge "@": LAUNCHER → AI-Provider Connector (Ollama default)
│         structured-envelope tool-call over the SAME registry; opaque-ID args (PII-free);
│         sensitivity router → local Ollama for PII; @/lib/pii redaction before any cloud;
│         confirm-gate = visible consent checkpoint
└─ Voice: local-first STT (Web Speech v1 / whisper-wasm module = zero-egress);
          cleanup on local Ollama; cloud-STT = opt-in fallback Module
```

## Spec scope (thin domain-core)

Spec captures only the boundaries, not the cmdk/keyboard/ranking mechanics (2.16 precedent: pure UI infra → no spec). Proposed `spotlight.allium`:
1. **Action-Registry contract** — generic dispatch, self-declaring, `WidgetRegistryLookup`-style invariant (no hardcoded actions).
2. **Same-auth invariant** — a palette action enforces the native authorization of its target (admin gate + IDOR), gating-as-predicate.
3. **Search ownership + minimization invariant** — own-data-only, minimal projection.
4. **AI-bridge redaction invariant** — free-text→cloud redacted, voice transcript cleaned locally first, opaque-ID args.
5. Reference the existing **crm quick-capture provenance** open question (`crm.allium`).

## Recommended sequencing

1. **`allium:elicit` → `spotlight.allium`** (thin domain-core) — Allium-first, the sustainable path.
2. **FTS5 search index** (single table) + wire `CommandDialog`.
3. **Action-Registry** (kbar-shaped, native) + navigation / search / action tiers (no AI yet).
4. **AI-bridge + voice** as a later phase (gated on the redaction middleware + the local-first STT decision).
5. **Inline-create slice** → after the **provenance decision** (born-ambiguous constraint — lock before the quick-create UI ships).

---

## Appendix A — Twenty CRM Command Menu (architecture reference)

- **Registry source of truth:** `STANDARD_COMMAND_MENU_ITEMS` (`twenty-server/.../constants/standard-command-menu-item.constant.ts`) seeded into `CommandMenuItemEntity`. Dispatch key = `engineComponentKey` enum (`CREATE_NEW_RECORD`, `SEARCH_RECORDS`, `ASK_AI`, `NAVIGATION`, …).
- **Generic dispatch:** `ENGINE_COMPONENT_KEY_COMPONENT_MAP` (`twenty-front/.../EngineComponentKeyHeadlessComponentMap.tsx`) + `CommandRunner.tsx` renders `map[ctx.key]` inside an error boundary — no module if/switch. **The literal pattern JobSync wants.**
- **Gating, two layers:** coarse `availabilityType` enum + predicate filters; fine `conditionalAvailabilityExpression` string DSL (`expr-eval-fork`, `twenty-shared/.../evaluateConditionalAvailabilityExpression.ts`) referencing `permissionFlags.*` / `objectPermissions.*`. The `Gate…Command` is a one-time data migration backfilling the expression. **Permissions are data, not a separate auth layer.**
- **Search:** `SearchService.getAllRecordsWithObjectMetadataItems` (`twenty-server/.../search/services/search.service.ts`) — per-object fan-out (chunked 5), `searchVector` tsvector, `ts_rank_cd → ts_rank → STANDARD_OBJECTS_BY_PRIORITY_RANK`, `:*` prefix, AND+OR variants, **ILIKE fallback on zero rows** (CJK/tokenizer safety), `SearchRecordDTO = {recordId, objectNameSingular, label, imageUrl, tsRankCD, tsRank}` (heavily minimized), rank-cursor pagination, server `@Max(100)` limit / default 60.
- **Shell/hotkeys:** `useCommandMenuHotKeys.ts` — ⌘K toggle, `/` record-search, `@` AskAI, Esc back, Backspace navigate (only when input empty). Focus-scoped via a focus stack. Nav model = `currentPage` enum + `navigationStack[]` of `{page,title,icon,pageId}` + per-page sub-stack. Context palettes = same registry filtered by context, not separate components.
- **AI "@":** thin — palette only navigates to the AskAI page; AI is its own agent-chat module. Server tool-provider registry (`ToolRegistryService`) aggregates self-declaring `ToolProvider`s, AI-SDK `ToolSet`, **two-phase lazy schema loading** (slim catalog → resolve schemas on demand; meta-tools for dynamic discovery).
- **STEAL:** (1) declarative registry + key→component dispatch; (2) gating as predicates against one context object; (3) minimized search DTO + fan-out + priority tie-break + LIKE fallback.
- **AVOID:** (1) string-expression DSL + eval sandbox (use typed TS predicates); (2) rank-cursor pagination + multi-tenant workspace-metadata machinery (single-user → static in-code array + LIMIT/OFFSET).

## Appendix B — JS command-palette libraries (component decision)

- **Recommendation:** build on cmdk (already present); do not add kbar/kmenu/react-command-palette.
- **kbar Action shape** (`kbar/src/types.ts:15-28`): `{id, name, shortcut[], keywords, section, icon, subtitle, perform, parent, priority}`. Flat store keyed by id (`ActionStore = Record<ActionId, ActionImpl>`); parent/child wired by reference resolution at insert (`action/ActionImpl.ts:42-82`). `useRegisterActions(actions, deps)` registers on mount, unregisters on unmount. Section name appended into keywords. `perform` returning a fn = undo/negate.
- **Ranking:** cmdk `commandScore` (`command-score.ts` — continuous=1.0, word-jump=0.9, char-jump=0.17, transposition/case/distance penalties; overridable per-`<Command filter shouldFilter>`). kbar = Fuse.js + composite `1/(score+1) + action.priority`, sections ranked by max member priority (`useMatches.tsx:122-167`). kmenu = pluggable `FilterFunction`. **Adopt:** cmdk fuzzy + kbar priority/section ordering on top; `shouldFilter={false}` for server-ranked search.
- **Nesting/async:** cmdk pages stack (`pages: string[]`, Backspace/Esc pops); kmenu's overloaded `action() => void | Promise | CommandOption[]` (`core.ts:811-829`) unifies sync/nav/async-fetched-subitems; cmdk `<Command.Loading>`/`forceMount` for async UX.
- **Ruled out:** kbar (React-16/17-pinned, perma-beta), react-command-palette (class + autosuggest + modal), cmd-dialog (Lit, vanilla), reablocks (full lib — Stepper is a CRM ref only), astro/nuxt clones (wrong framework, UX reference only).

## Appendix C — dotdotduck (AI-bridge + voice reference)

- **What it is:** framework-agnostic SDK bolting a Cmd+K palette + voice + DOM-grounded AI agent onto an existing app ("the opposite of a chatbot widget"). AGPL-3.0.
- **NL→action:** structured-output via a single forced `agent_turn` tool call — envelope `{memory, turn_planning, todo_adjust, actions[], is_final}`; property order load-bearing. Actions = `ActionDefinition` (name + JSON-Schema params + handler + `requireConfirmation`). Tool catalog rendered into the prompt (`renderToolReference`); selected by name. Grounding = indexed/hashed DOM dump (`[ea3f]`) passed verbatim as args → no selector hallucination. Disambiguation as first-class actions (`ask_user_choice`/`present_surface`). `resolveLLM(source, role)` router = the provider-selection seam.
- **Voice (`src/modules/voice/voice.ts`):** Web Speech primary + host `transcribe(blob)` fallback + `transcribeMode: 'fallback'|'always'`. Hold-Space → `captureOnce()` → start/interim/final → route (input fill vs agent task). Optional LLM cleanup pass (`utility` role). Hardening: `warmUp()`, `autoRestartOnEnd`, `captureTimeoutMs`.
- **GDPR gap (must build):** dotdotduck's only redaction hides the API key (ProxyProvider); **no cloud-egress free-text PII redaction, no sensitivity-based routing**. `memory/pii.ts` only gates agent memory, not provider egress. JobSync must insert a sensitivity-aware routing + `@/lib/pii` redaction middleware between the envelope-builder and the AI-Provider Connector.
- **Ideas adopted:** structured envelope over an action-registry routed through the AI-Provider Connector with a `sensitivity` flag; two-module STT boundary (local default / cloud opt-in) with cleanup on local Ollama; confirmation-gated ask-back actions as the visible redaction+consent checkpoint.

---

## Follow-up (2026-06-20) — additional borrows, File Explorer, dual-graph verification

### F.1 More to borrow from Twenty (beyond Appendix A)

Mined from the cloned `/home/pascal/projekte/twenty` command-menu module:

| Borrow | Twenty source | JobSync use |
|---|---|---|
| **Pinned / favourites + ordering** | `isPinned`/`position`, `PinnedCommandMenuItemButtons.tsx`, `AddToFavoritesSingleRecordCommand.tsx` | Pin frequent actions/entities to the top; an "Add to favourites" command. `shortLabel` for narrow rows. |
| **Dynamic label interpolation** | `interpolateCommandMenuItemFields.ts` | Descriptor templates → "Delete {jobTitle}", "Open {companyName}" filled from the context record. |
| **Mobile variant** | `CommandMenuForMobile.tsx` | Responsive palette = bottom Sheet on mobile. JobSync already has the pattern (`use-media-query` + responsive Sheet) → reuse. |
| **Visible open affordance** | `CommandMenuButton.tsx` | A clickable button to open the palette (discoverability), not keyboard-only. Pairs with the "?" help (2.16). |
| **In-editor slash menu** | `SlashCommandMenu.tsx` / `DefaultSlashCommands.ts` / `SlashCommand.ts` | Separate surface from the global palette but the **same registry concept**. JobSync uses Tiptap (3.3) → a "/" menu inside note/job-description editors can **reuse the Action-Registry descriptors**. One registry → two consumers (global ⌘K + in-editor "/"). |
| **FALLBACK availability item** | `availabilityType: FALLBACK` | When no command matches → offer a default (search / create) instead of an empty state. |
| **Per-kind payload integrity** | `engineComponentKey` CHECK constraint | JobSync analog: a **typed discriminated-union descriptor** (per-kind payload type) → TS enforces at compile time what Twenty enforces with a DB constraint. |

**NOT in Twenty (borrow from dotdotduck):** usage/recency ranking ("heat-rank"). Twenty has no recently-used boost. JobSync can implement it by **reusing existing `getRecentJobs`/`getRecentActivities`** (recency data already tracked).

### F.2 File Explorer — Twenty confirms and sharpens point 2

Twenty has **no file browser** — only Attachments scoped to records, reached **transitively** (palette → record search → show-page → Files tab; *zero* direct palette↔file edges). Verbatim finding (another agent):

`````text
No file browser. Twenty has Attachments (files scoped to records), not a file-explorer.

  What exists

  Frontend — per-record file list (twenty-front/src/modules/activities/files/, 39 attachment nodes)
  - components/AttachmentList.tsx, AttachmentRow.tsx, AttachmentDropdown.tsx — the "Files" tab shown on a record's show-page.
  - hooks/useAttachments.tsx (fetch), useUploadAttachmentFile.tsx (upload).
  - types/Attachment.ts, AttachmentFileCategory.ts; utils getAttachmentUrl/getAttachmentPath.
  - Plus modules/file/ — AttachmentChip.tsx, upload mutations; editor uploads via blocknote-editor/hooks/useAttachmentSync.ts.

  Data model — Attachment is a standard object: twenty-server/src/modules/attachment/standard-objects/attachment.workspace-entity.ts (AttachmentWorkspaceEntity). It's a normal record type
  with relations to other records (polymorphic target), so files live on companies/people/opportunities/etc.

  Backend storage (twenty-server/src/engine/core-modules/, 100 file-module nodes)
  - file-storage/drivers/ — pluggable: local.driver.ts, s3.driver.ts, validated-storage.driver.ts, behind storage-driver.interface.ts + file-storage-driver.factory.ts.
  - file/ — file.controller.ts (download), file-url/ (signed URLs), guards/file-path-guard.ts + file-by-id.guard.ts (access control), files-field/ (the files field type + deletion
  job/listener). Sub-modules: file-email-attachment, file-core-picture (avatars), file-workflow, file-ai-chat.

  Connection to Command Menu: none direct (0 edges)

  Graph confirms zero edges between any command-menu node and any file/attachment node. The palette has no "file browser" mode.

  The link is transitive:
  1. ⌘K palette runs full-text record search → command-menu/graphql/queries/search.ts (tsvector, backend core-modules/search).
  2. Selecting a result opens that record's show-page.
  3. The show-page renders the Files tab (activities/files/AttachmentList) — that's where attachments live.

  So you reach files through a record found via the Command Menu, not from the palette itself. (The "folder" graph hits — computeMessageFolderTree, message-folder migrations — are email sync
  folders, a separate messaging concern, not file storage.)
`````

**Three lessons:**
1. **Transitive model = a valid, free v1.** JobSync ships the same with zero new Spotlight work: search finds Job/Company/Person → detail page has a files/attachments tab. Files reached *through* a record.
2. **ROADMAP 2.8 goes BEYOND Twenty** (a standalone File Explorer: organize/rename/delete — Twenty has none). Two complementary surfaces: (a) files-as-attachments-on-records (transitive, free now) + (b) File-as-searchable-entity + file-actions in the registry (direct, manifest-driven, when 2.8 ships).
3. **Borrow Twenty's file-storage architecture** — pluggable storage drivers (local/s3) behind `storage-driver.interface.ts` + factory, signed URLs, `file-path-guard`/`file-by-id-guard`, **polymorphic Attachment target**. **JobSync already has the seed:** `src/lib/assets` (logo-asset-service) + `src/lib/storage.ts` (`getDataDir`/`getStoragePath`) + `/api/logos/[id]` authenticated serving + IDOR guards + the polymorphic-target pattern (`CrmTaskTarget`/`NoteTarget`). The File Explorer = **generalize the asset layer into a polymorphic Attachment entity**, mirroring `AttachmentWorkspaceEntity`. CLAUDE.md already states "File Explorer will later live alongside" logo-asset in `src/lib/assets`.

### F.3 Dual-graph verification (`/understand-chat` + `/understand-domain`)

**Code graph (`/understand-chat`) — JobSync-side reuse confirmed:**

| Claim | Verdict | Files |
|---|---|---|
| (a) Mobile palette = reuse responsive Sheet | ✅ exists | `src/hooks/use-media-query.ts`, `src/components/ui/sheet.tsx`, `StagedVacancyDetailSheet.tsx`, `TipCaptureSheet.tsx` |
| (b) In-editor "/" slash menu host | ✅ exists | `src/components/TiptapEditor.tsx`, `TipTapContentViewer.tsx` |
| (c) Favourites / pinned | ⚠️ none — only recency | no pinned concept; `getRecentJobs`, `getRecentActivities`, `RecentCardToggle.tsx` exist |
| (d) Asset layer + polymorphic target | ✅ exists | `src/lib/assets/{logo-asset-service,file-cleanup,orphan-finder,logo-asset-subscriber}.ts`, `src/lib/storage.ts`, `logoAsset.actions.ts`, `/api/logos/[id]`, `specs/logo-asset-cache.allium`; `CrmNoteTarget`/`CrmTaskTarget` |

→ **Pinned/favourites = genuinely new; recency-ranking can reuse existing `getRecent*` actions.**

**Domain graph (`/understand-domain`) — 9 domains:** Job Application Tracking · Automated Job Discovery · CRM & Contacts · Inside-Track Referrals · Profile & Resume Management · Notifications · Data Enrichment · Settings & API Keys · GDPR & Privacy.

Two structural absences that validate the design:
1. **No "Search" domain** → Spotlight Search is a **cross-domain read surface** (searchable entities live across Job/CRM/Discovery/Profile/Referral); the Action-Registry is a **cross-domain action surface**. Confirms "Spotlight = app-layer above the domains, not a domain entity."
2. **No "File"/"Asset"/"Document" domain** → files exist today only as sub-mechanisms (logo assets under *Data Enrichment*; resumes under *Profile & Resume Management*). ROADMAP 2.8 File Explorer is **greenfield at the domain level** → best realized as a **new polymorphic-Attachment domain generalizing the existing asset+resume mechanisms** (Twenty's pattern), with no existing "Files" concept to collide with.

### F.4 Voice — STT/TTS, offline vs API (`speech` Connector)

Voice splits into **STT** (input — the 2.20 voice tier) and **TTS** (output — optional, agent narration / accessibility). Both have offline and API options:

| | Offline / on-device | API (cloud) |
|---|---|---|
| **STT** (speech→text) | **whisper.cpp / whisper-wasm** = true zero-egress, local (tiny/base/small ~75–500MB). Browser **Web Speech API** = zero-setup but NOT truly offline (Chrome/Edge→Google, Safari→Apple). | OpenAI Whisper API, Deepgram, Azure/Google STT |
| **TTS** (text→speech) | Browser **`speechSynthesis`** = OS voices, offline, zero-egress, zero-setup (good default). **Piper** / Coqui = local neural, offline. | OpenAI TTS, ElevenLabs, Google/Azure TTS |

**Through the project rules:** a new `speech` ConnectorType with **local Modules as default** (whisper-wasm / Web Speech / `speechSynthesis` / Piper) + **cloud Modules opt-in** (Whisper API / OpenAI TTS) — mirrors the **Ollama-local-default / cloud-optional** AI-Provider pattern. GDPR: local-first; any cloud STT/TTS = third-party transfer → the same redaction + consent gate as the AI-bridge. **TTS is optional** (STT is the 2.20 tier; TTS is a nice-to-have). Run transcript cleanup on local Ollama before any cloud step.

### F.5 Licensing & attribution (decisive — honour borrowed work)

**JobSync is MIT.** Verified licenses of the reference repos:

| Permissive — code-copy OK *with attribution* | Strong copyleft — **concepts only, NO code** |
|---|---|
| cmdk, kbar, kmenu, react-command-palette, cmd-dialog, astro-command-palette = **MIT** · reablocks, raycast-nuxt-ui-clone = **Apache-2.0** | **Twenty = GPL** · **dotdotduck = AGPL** |

**The rule:**
- **Concepts / patterns / ideas** (registry shape, composite ranking, the `agent_turn` envelope, hotkey scheme, search fan-out, polymorphic Attachment) are **not copyrightable** → reimplement freely, no obligation. This design already says "mirror natively / build natively" — the safe path. Courtesy: credit the source in code comments + this doc.
- **Copied code** is bound by the source license:
  - **MIT** sources → copying OK **iff** the copyright line + MIT notice is preserved. (cmdk is already a dependency; its MIT ships in `node_modules`.)
  - **Apache-2.0** (reablocks, raycast) → preserve NOTICE + attribution + state changes.
  - **GPL / AGPL** (Twenty, dotdotduck) → **DO NOT copy code into MIT JobSync.** Copyleft is viral — GPL/AGPL code would force JobSync itself to (A)GPL (AGPL is even *network*-viral). Take **ideas only**, never source.

**Action items for implementation:**
1. Twenty + dotdotduck = **patterns-only, no code** (protects the MIT license). All borrowings in this doc from them are conceptual.
2. Any copied MIT/Apache snippet keeps its license header; add the source to a project `CREDITS`/`THIRD_PARTY_NOTICES` if non-trivial.
3. Credit pattern sources in code comments (e.g. `// Action-Registry shape mirrors kbar (MIT); ranking pattern after kbar useMatches`).

### F.6 References & provenance

Citation convention in this doc: `path:line` where a precise anchor exists (richest in Appendices A–C, which carry the deep-review agents' file:line citations); `path` alone where the reference is a whole file/module. Pattern-source line anchors (cmdk/kbar/kmenu/Twenty) live in the appendices; JobSync-side anchors are inline in §0–§5 and F.3. The 3 deep-review subagent transcripts + the dual-graph (`/understand-chat` knowledge graph, `/understand-domain` domain graph) are the provenance for every claim; reference repos are cloned at `/home/pascal/projekte/`.

---

## Cross-references

- ROADMAP 2.20 (Spotlight), 2.16 (Keyboard Shortcuts — UI-infra-no-spec precedent), 2.18 (Analytics), 2.21 (CompanyDetail), 2.8 (File Manager), 4.2 (cv-document — gates doc-export actions), 1.12 (Communication), 5.x (CRM).
- `specs/automation-wizard.allium` (`WidgetRegistryLookup` — the manifest-driven precedent to mirror).
- `specs/crm.allium` (quick-capture provenance open question — gates the inline-create slice).
- `@/lib/pii` + `ai-provider.allium` `CloudTransferDataMinimization` (the AI-bridge redaction invariant).
- BACKLOG Welle-5 blind-spot: ADR-019 select-hygiene sweep (independent hygiene, not a Spotlight prereq).
