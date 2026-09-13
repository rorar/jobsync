# Two unused connector registry facades — origin, intent, and the delete/keep decision

**Status:** decision brief. Nothing has been changed. Written 2026-09-09 on branch `fix/e2e-elysium`.
**Subjects:** `src/lib/connector/data-enrichment/registry.ts` (53 lines), `src/lib/connector/reference-data/registry.ts` (17 lines).
**Method:** git archaeology + grep over the working tree. No build, test, typecheck or knip run was performed; the knip verdict below is the one supplied by the requester and independently corroborated by grep.

---

## 1. What the two files are, and what knip says

`bun knip` reports both as **unused files**:

```
src/lib/connector/data-enrichment/registry.ts
src/lib/connector/reference-data/registry.ts
```

Corroborated by grep, not just taken on knip's word. Across `src/`, `__tests__/`, `e2e/` and `scripts/`, the five exports of the two files are referenced **only inside the files that declare them**:

| Export | Declared at | Referenced outside its own file |
|---|---|---|
| `enrichmentConnectorRegistry` | `data-enrichment/registry.ts:34` | none |
| `getActiveEnrichmentModules()` | `data-enrichment/registry.ts:39` | none |
| `getEnrichmentModuleByDimension()` | `data-enrichment/registry.ts:47` | none |
| `getReferenceDataModules()` | `reference-data/registry.ts:11` | none |
| `getActiveReferenceDataModules()` | `reference-data/registry.ts:15` | none |

Neither file matches any of the three shapes `CLAUDE.md` records as making knip wrong in this repo (ambient `.d.ts`, dynamic template import, framework-convention entry). They are plain modules with plain named exports. **knip is right here.**

`CLAUDE.md:280` already says so, in the Data Enrichment Connector section. Quoted exactly:

> - **registry.ts** — Facade: `getActiveEnrichmentModules()`, `getEnrichmentModuleByDimension()`. **Currently UNUSED (verified 2026-09-02): zero importers, and `orchestrator.ts:12` bypasses it for `moduleRegistry` directly.** Aspirational rather than live; `reference-data/registry.ts` is unused the same way, while the `job-discovery/` and `ai-provider/` facades ARE consumed. Decide before adding a module: route new code through these, or delete both files together with this paragraph — deleting the files alone leaves this text promising a seam that no longer exists.

---

## 2. Origin

### `data-enrichment/registry.ts`

**Commit `c6ec2872e30d18a379efdd7d14f6da0fd1d32516`, 2026-04-03 08:02:07 +0000, rorar** —
`feat(enrichment): implement Data Enrichment Connector with 3 modules` (31 files, +4328/−12).

The file was part of the initial Data Enrichment Connector landing (ROADMAP 1.13). The commit message names it in one line, under a heading of its own:

> Connector Infrastructure:
> - DataEnrichmentConnector interface with fallback chain orchestration
> - **Registry facade for active enrichment modules by dimension**
> - Orchestrator: sequential chain execution, skip inactive/unhealthy,
>   first-success-wins, EnrichmentCompleted/Failed domain events

So it was *declared* deliberate at the time. What the message does not say — and what section 4 establishes — is that the orchestrator shipped in the very same commit already bypassing it.

### `reference-data/registry.ts`

**Commit `14340a9223d4c135d862fe718fb1286b428354e8`, 2026-04-08 09:32:47 +0000, rorar** —
`feat(connector): add Reference Data connector, fix EURES API, dependency health` (26 files, +1606/−19).

The file was part of introducing the `reference_data` ConnectorType and moving ESCO/Eurostat out of `data_enrichment`. The commit message lists the connector's parts:

> Reference Data Connector:
> - New ConnectorType: REFERENCE_DATA + ReferenceDataManifest (taxonomy field)
> - New modules: esco-classification, eurostat-nuts (health-only, created fresh …)
> - DependencyHealthCheck interface + dependencies field on ModuleManifest
> - Health monitor: checkDependencyHealth() — degraded never unreachable (spec rule)
> …

**The registry facade is not mentioned anywhere in that commit message.** It arrived silently as part of the directory scaffold.

It does appear in the implementation plan that drove the commit, `docs/superpowers/plans/2026-04-07-reference-data-connector.md:21`:

> - `src/lib/connector/reference-data/registry.ts` — Facade over moduleRegistry for reference_data modules

and the plan (line 163 onward, "Step 2: Create registry.ts") specifies the file's contents *verbatim* — including the justification that ended up as its own header comment:

> ```
>  * Reference Data — Registry Facade
>  *
>  * Thin wrapper over the unified ModuleRegistry for reference_data modules.
>  * Same pattern as job-discovery/registry.ts and data-enrichment/registry.ts.
> ```

That is the whole stated reason: **"same pattern as"**. The plan's own "Modified files" list (lines 32–45) names no file that would import it. The consumer the plan does name for `module.actions.ts` is the *registration barrel* (`reference-data/connectors.ts`), not the registry facade.

---

## 3. What the design intended

### The rule that created facades in the first place — ADR-013

`docs/adr/013-module-lifecycle-manager.md:23`:

> **Unified ModuleRegistry** (`src/lib/connector/registry.ts`): Single registry for all modules, storing `RegisteredModule` entities (manifest + runtime state). **Existing registries become facades.**

and `docs/adr/013-module-lifecycle-manager.md:38`, listed as Key Design Decision #1:

> 1. **Facades over replacement**: Old registries become facades, **preserving all existing import paths**

`docs/architecture/overview.md:338` states the same rule and names its scope exhaustively:

> - Both `ConnectorRegistry` and `AIProviderRegistry` are facades; **they exist only to preserve existing import paths.**

This is a **migration-compatibility rule**, not an architectural pattern. It applies to a registry that already had callers when the unified `ModuleRegistry` replaced it. `data-enrichment` and `reference-data` were both created *after* the unified registry existed; neither had a single import path to preserve.

**The architecture never asked for a per-connector registry facade as a general seam.** Two specific checks:

- `docs/architecture/overview.md:300–333` prints the `src/lib/connector/` tree with the design decisions "preserved here". It lists `job-discovery/registry.ts — ConnectorRegistry facade` and `ai-provider/registry.ts — AIProviderRegistry facade`. It **does not list the `data-enrichment/` or `reference-data/` directories at all.**
- `docs/architecture/c4-components.md` describes the facade pattern twice (lines 255, 270, 279 for job-discovery; 348, 365, 371 for ai-provider) and **never for the other two**.

### What the specs say

- `specs/data-enrichment.allium` mentions a registry exactly once, at line 27: *"Module registered in the unified ModuleRegistry (module-lifecycle.allium)."* — the **unified** registry. **No spec clause anywhere requires a per-connector facade for enrichment.**
- `specs/module-lifecycle.allium` mentions a registry only at lines 870 and 902–903 (`@guarantee ModulesFromRegistry` — "All displayed modules come from the registry, not hardcoded lists"), satisfied today by direct `moduleRegistry` calls.
- `specs/ai-provider.allium:273` does describe a facade — *"AIProviderRegistry is a thin facade over ModuleRegistry filtered by ConnectorType"* — i.e. the spec layer knows about the facade that **is** used, and is silent about the two that are not.

**No record found** of any design document, ADR or spec stating that enrichment or reference-data consumers *should* go through a per-connector facade. The idea exists in exactly three places, all descriptive rather than prescriptive: the two files' own header comments, `docs/ROADMAP.md:2794–2797`, and `CLAUDE.md`.

### The one forward-looking statement that assumes they are live

`docs/ROADMAP.md:2794` (in the ADR-028 Self-Contained-Modules discussion, "Was sich NICHT ändert"):

> - **Facade-Registries** (`data-enrichment/registry.ts`, `job-discovery/registry.ts` etc.) — bleiben als typisierte Query-Layer. Sie registrieren nichts (`.register()` ist bereits No-Op), sie filtern nur per `moduleRegistry.getByType()`. Unverändert.

`docs/ROADMAP.md:2797`:

> Die Facade-Registries (`enrichmentConnectorRegistry.create()`, `getEnrichmentModuleByDimension()`) und der `EnrichmentOrchestrator` rufen `moduleRegistry.getByType()` / `moduleRegistry.create()` auf. Module MÜSSEN registriert sein bevor die erste Facade-Abfrage erfolgt.

Read carefully, this is an **impact assessment** ("nothing about self-registration changes these"), not a requirement to keep them. But it does describe `enrichmentConnectorRegistry.create()` and `getEnrichmentModuleByDimension()` as things that get *called*, which is not true and was not true when it was written.

### How the reviewer of the day passed it

`docs/reviews/s4/consolidated-report.md:93`:

> | S4-ARCH03 | Registry facade follows existing job-discovery/ai-provider pattern | Clean |

The architecture review validated the **shape** against a precedent and did not check whether anything called it. This is the mechanism by which the dead pattern was blessed, and one week later copied.

---

## 4. Why they ended up unused

### The bypass is not drift. It is birth.

`git blame -L 12,12 src/lib/connector/data-enrichment/orchestrator.ts`:

```
c6ec2872e (rorar 2026-04-03 08:02:07 +0000 12) import { moduleRegistry } from "../registry";
```

`c6ec2872` is **the same commit that created the facade.** Reading `git show c6ec2872:src/lib/connector/data-enrichment/orchestrator.ts` confirms line 12 of the file's very first version is already `import { moduleRegistry } from "../registry";`. The facade and the code that bypasses it were written by the same author on the same day in the same commit. There is no "before" in which the seam was live.

### Neither facade was ever referenced from any other file, ever

Pickaxe over all history, scoped to `src/`:

```
$ git log --oneline --all -S getActiveEnrichmentModules   -- 'src/*'
c6ec2872 feat(enrichment): implement Data Enrichment Connector with 3 modules

$ git log --oneline --all -S getEnrichmentModuleByDimension -- 'src/*'
c6ec2872 feat(enrichment): implement Data Enrichment Connector with 3 modules

$ git log --oneline --all -S getReferenceDataModules       -- 'src/*'
14340a92 feat(connector): add Reference Data connector, fix EURES API, dependency health

$ git log --oneline --all -S getActiveReferenceDataModules -- 'src/*'
14340a92 feat(connector): add Reference Data connector, fix EURES API, dependency health
```

Four of the five exports appear in exactly **one** commit each — the one that created them. A symbol that was used and later removed would show a second commit. There is none. **They have been dead since birth.**

The fifth, `enrichmentConnectorRegistry`, appears in three commits, and none is a consumer:

- `c6ec2872` — creates it, and creates `data-enrichment/connectors.ts`, whose entire body is `import { enrichmentConnectorRegistry } from "./registry"; export { enrichmentConnectorRegistry };` — a **pass-through re-export from a barrel that registered nothing** (its module imports were commented out, awaiting "a separate agent").
- `d70afa56` `refactor(connector): replace 4 per-connector barrels with central register-all.ts` (2026-04-08) — deletes that barrel. The re-export goes with it. Nothing downstream needed patching, because nothing had imported it.
- `14585f8f` `fix(enrichment): cross-user cache leak, dead timeout, batch throttling, DRY violations` (2026-04-08) — under the bullet *"Apply globalThis singleton pattern to 7 registries/services missing it"*, converts `export const enrichmentConnectorRegistry = new EnrichmentConnectorRegistry()` into the HMR-safe `globalThis` form, and removes its no-op `register()` method. **A maintenance edit applied to a file with no callers.** That is the ongoing cost of keeping it, made concrete.

`reference-data/registry.ts` was never even re-exported: `git show 14340a92:src/lib/connector/reference-data/connectors.ts` is a pure registration barrel that imports `moduleRegistry` directly and never mentions its sibling facade.

### The facade also cannot serve the orchestrator's actual need

`src/lib/connector/data-enrichment/orchestrator.ts:160`:

```ts
const connector = moduleRegistry.create(entry.moduleId, credential) as DataEnrichmentConnector;
```

The unified registry's signature is `create(moduleId: string, ...args: unknown[])` (`src/lib/connector/registry.ts:92`) and the orchestrator passes a **credential** as the second argument (PUSH pattern). The facade's method is `create(id: string)` (`data-enrichment/registry.ts:17`) — it drops the credential. Routing the orchestrator through the facade today would not compile without widening the facade first. So the bypass is not merely habit; the facade never fit the one call site it plausibly existed for.

---

## 5. The contrast that matters: are the used pair the same shape?

They are the same *shape* and a different *kind*.

| | `job-discovery/registry.ts` | `ai-provider/registry.ts` | `data-enrichment/registry.ts` | `reference-data/registry.ts` |
|---|---|---|---|---|
| Header comment | "Preserves the **existing** public API for all callers" | "Preserves the **existing** public API for all callers" | "Preserves the **existing** public API pattern for all callers" | "**Same pattern as** job-discovery/registry.ts and data-enrichment/registry.ts" |
| Predated the unified registry? | **Yes** — added `ba394ba3` 2026-02-20, `refactor(scraper): replace direct JSearch calls with connector registry`, a month before the unification | **Yes** — added `d7c4e472` 2026-03-25, `refactor(connector): unify scraper + AI under src/lib/connector/ (Roadmap 0.1)` | **No** — born 2026-04-03, after | **No** — born 2026-04-08, after |
| Had import paths to preserve? | Yes | Yes | **No** | **No** |
| Re-exported from a package barrel? | Yes — `job-discovery/index.ts:6` | Yes — `ai-provider/index.ts:61` | **No `index.ts` exists in the directory** | **No `index.ts` exists in the directory** |
| Real consumer today | `src/components/myjobs/AddJob.tsx:61,88` → `connectorRegistry.availableConnectors()` builds the job-source dropdown | `src/lib/connector/ai-provider/providers.ts:3,11` → `aiProviderRegistry.create(moduleId)` inside `getModel()` | none | none |
| Named in `docs/architecture/overview.md` / `c4-components.md` | Yes | Yes | **No** | **No** |

Note the header comments. Three of the four say they preserve an *existing* API — and for two of them that is literally true. The `data-enrichment` one repeats the sentence with "pattern" spliced in ("preserves the existing public API **pattern**"), which is the sentence quietly losing its meaning: there was no existing API. The `reference-data` one drops the pretence and cites the other two as precedent.

**Conclusion: the asymmetry is a consequence, not an accident.** The used pair are legacy compatibility shims that inherited callers. The unused pair are greenfield copies of a shim, made for connectors that had no callers to inherit. They look identical because the second pair was written by copying the first; they behave differently because only the first pair had a reason to exist.

A second consequence: **the four "facades" do not share an interface.** `availableConnectors()` / `availableModules()` return `string[]`; `getActiveEnrichmentModules()` / `getReferenceDataModules()` return `RegisteredModule[]`. There is no common type, no shared base, nothing that would let a caller treat them uniformly. They are four independently-shaped files that resemble each other.

---

## 6. The case FOR keeping

Three arguments, in descending strength.

**(a) `getEnrichmentModuleByDimension()` is the only code anywhere that reads `supportedDimensions`.**

`DataEnrichmentManifest.supportedDimensions` is declared at `src/lib/connector/manifest.ts:201`, specified at `specs/data-enrichment.allium:128` —

> ```
> contract DataEnrichmentManifest {
>   supportedDimensions: Set<EnrichmentDimension>
>     -- Which dimensions this module can enrich.
> ```

— and populated by all three enrichment modules (`google-favicon/manifest.ts:19`, `meta-parser/manifest.ts:22`, `logo-dev/manifest.ts:23`). Its **only production reader is `data-enrichment/registry.ts:51`**. Everything else is `__tests__/manifests.spec.ts:121–125`, which only asserts the array is non-empty.

The orchestrator selects modules from a static `FallbackChainConfig` of module IDs (`data-enrichment/types.ts:80–83`) and never consults `supportedDimensions`. So a chain entry could name a module that does not support the dimension and nothing would catch it. Wiring `getEnrichmentModuleByDimension()` into the orchestrator as a chain guard is a **real, small, useful change** — and it is the only concrete way either file could become live that improves anything.

Honest counterweight: this is a reason to *write that guard*, not a reason to keep a dead file in the hope someone does. The field is unenforced **today**, with the file present. Deleting the file does not weaken an enforcement that exists; it removes the illusion that one might.

**(b) `ModuleRegistry.getActive()` loses both of its production callers.**

`src/lib/connector/registry.ts:86` is called from exactly two places in `src/`, and both are inside the dead facades (`data-enrichment/registry.ts:40`, `reference-data/registry.ts:16`). After deletion its only remaining reference is `__tests__/module-registry.spec.ts:133`. Expect it to surface as a *new* knip finding (an export used only in tests) on the next run. That is a follow-up, not a blocker — but the cleanup does not end with two files.

**(c) `docs/ROADMAP.md:2794` says they "bleiben" (remain).**

Weak. That sentence is inside an impact assessment of self-registration, answering "what does ADR-028 *not* change", not "what must the codebase keep". And `:2797` in the same block describes them as being called, which was never true.

### What would have to happen to make them live

For completeness, the plausible wirings and why each is unattractive today:

1. **Orchestrator uses `enrichmentConnectorRegistry.create()`** — blocked until the facade's `create(id)` is widened to forward a credential (§4). Pure churn; the facade would add a cast and a hop over `moduleRegistry.create()`.
2. **`module.actions.ts:69–74` / `apiKey.actions.ts:70–71` query through the facades** — these sites aggregate all four connector types in a single expression (`...moduleRegistry.getByType(JOB_DISCOVERY), ...getByType(AI_PROVIDER), ...getByType(DATA_ENRICHMENT), ...getByType(REFERENCE_DATA)`). Two of the four have no equivalent facade function returning `RegisteredModule[]` (§5). Routing two of four through facades makes that code *less* uniform.
3. **Orchestrator validates its chain against `supportedDimensions`** — the one genuinely valuable option (see (a)). It needs ~10 lines in `orchestrator.ts` and would justify keeping *one* function out of the five.

---

## 7. The case FOR deleting

**Nothing breaks.** Zero importers across `src/`, `__tests__/`, `e2e/`, `scripts/` (§1). No test references either file. No compile edge: both are leaf modules importing downward only. Deleting them cannot change runtime behaviour, because no runtime path reaches them.

**The stated reason for their existence is documented and does not apply to them** — ADR-013's "preserving all existing import paths" (§3). Keeping them keeps a rule alive in a place where its precondition is false.

**They cost maintenance.** `14585f8f` already spent a hardening pass on `enrichmentConnectorRegistry` — globalThis singleton + dead-method removal — on a file with no callers.

**They propagate.** The `reference-data` facade exists because the `data-enrichment` facade existed and looked like a pattern; the plan's justification is literally "Same pattern as". A third connector type would very likely get a third one for the same reason. This is the concrete risk of leaving them: not that they break, but that they breed.

### Collateral edits, exhaustive

Everything that becomes false or dangling if both files are deleted.

**Must change (statements that become false):**

1. `CLAUDE.md:280` — the whole `- **registry.ts** — Facade: …` bullet in the Data Enrichment "Current structure" list. This is the paragraph the note itself designates. Remove it.
2. `CLAUDE.md:237` — `- **Reference Data** (`reference-data/`): `types.ts`, `registry.ts` (facade)` → drop `registry.ts (facade)`.
3. `CLAUDE.md:294` — `- **registry.ts** — Facade over `moduleRegistry` for `reference_data` modules` → remove the bullet.
4. `docs/ROADMAP.md:2794` — names `data-enrichment/registry.ts` in the "Facade-Registries … bleiben als typisierte Query-Layer" bullet. Either drop the filename or note that only the job-discovery/ai-provider facades remain.
5. `docs/ROADMAP.md:2797` — names `enrichmentConnectorRegistry.create()` and `getEnrichmentModuleByDimension()` as live facade queries. The import-order warning itself stays valid for `connectorRegistry` / `aiProviderRegistry` / the orchestrator; only the two dead names must go.
6. `src/lib/connector/register-all.ts:9` — the comment *"Modules must be registered before the first facade query (`enrichmentConnectorRegistry`, `connectorRegistry`, etc.)"* would name a symbol that no longer exists. One-word comment fix. **This is the only source-file edit required.**

**Should NOT change (historical records — amend, do not rewrite):**

7. `docs/adr/025-data-enrichment-connector.md:125` — `- src/lib/connector/data-enrichment/registry.ts -- EnrichmentConnectorRegistry facade` in the "Files Changed" list. This is an accurate record of what `c6ec2872` shipped and stays true as history. ADR-025 already carries an `## Amendment (2026-04-08)` at line 137 — precedent for appending a second amendment noting the deletion, rather than editing the list.
8. `docs/superpowers/plans/2026-04-07-reference-data-connector.md:21, 163, 216` — an executed plan. Leave.
9. `docs/reviews/s4/consolidated-report.md:69, 93` — a review record. Leave.

**No change needed (verified):**

10. `docs/architecture/overview.md` — does not mention either file; its tree covers only `job-discovery/` and `ai-provider/`, and its line 338 statement ("Both `ConnectorRegistry` and `AIProviderRegistry` are facades") remains exactly true.
11. `docs/architecture/c4-components.md` — same; mentions only the two used facades.
12. `CLAUDE.md:229` — "The old `ConnectorRegistry` and `AIProviderRegistry` are thin facades" — names only the two that stay. Already correct.
13. `specs/*.allium` — no spec references either file. `specs/data-enrichment.allium:128` keeps declaring `supportedDimensions`; see §6(a) for the consequence.
14. `knip.ts` — no ignore entry to remove; neither file was ever exempted.
15. `.understand-anything/knowledge-graph.json`, `.understand-anything/fingerprints.json` — reference both paths, but are generated artifacts, already governed by the staleness rule. Regenerate, do not hand-edit.

**Follow-up produced by the deletion (not a blocker):**

16. `src/lib/connector/registry.ts:86` `getActive()` becomes production-dead (test-only). Expect it in the next knip run. Decide then: delete it, or keep it as registry API surface.

---

## 8. Recommendation

**Delete both files.** Confidence: **high** for `reference-data/registry.ts`, **medium-high** for `data-enrichment/registry.ts`.

The distinction is worth stating rather than averaging away:

- `reference-data/registry.ts` contains two one-line wrappers over `moduleRegistry.getByType` / `getActive` with no unique logic, no consumer, no spec, no mention in the architecture docs, and a written justification that is nothing but "same pattern as the other one". There is no argument for it. Delete.
- `data-enrichment/registry.ts` contains one function with genuine content — `getEnrichmentModuleByDimension()` is the only reader of `supportedDimensions` in the codebase. My recommendation is still to delete it, and to record §6(a) as a separate, small backlog item: *the enrichment chain does not validate its entries against the modules' declared dimensions.* That defect exists today with the file present. If it is worth fixing, it is worth ~10 lines in `orchestrator.ts` where the chain is actually walked — not a re-import of a facade the orchestrator has never used. Keeping a dead file so that a manifest field appears to have a reader is the worse of the two failure modes: it makes an unenforced invariant look enforced.

The decisive evidence is §4: **`git blame` puts `orchestrator.ts:12`'s direct `moduleRegistry` import in commit `c6ec2872` — the same commit, the same author, the same day as the facade it "bypasses".** Combined with the pickaxe result that four of five exports appear in exactly one commit each (their own), this rules out the reading on which the "keep" case depends. There was never a seam that consumers used and then drifted away from. The files were born unreferenced and have never been referenced. The tidiness argument is not what is being applied here; the history is.

The secondary decisive point is §3/§5 together: ADR-013 and `docs/architecture/overview.md:338` state that facades exist **only to preserve existing import paths**, and both used facades predate the unified registry while both unused ones postdate it. The rule that produced facades never applied to these two. They are a pattern copied past its precondition — blessed as "Clean" by `S4-ARCH03` for matching a shape, then copied again five days later on the strength of that blessing.

### What would change my mind

- **A ROADMAP item requiring dimension-based *dynamic* module selection** (rather than the static `FallbackChainConfig` in use today) would make `getEnrichmentModuleByDimension()` a real seam worth keeping in place. I checked: `docs/ROADMAP.md` mentions future dimensions (`contact`, `salary`, `review` at lines 573, 576, 1092) and future enrichment modules (EP-3 Wikipedia Logo, line 538), but every one of them extends a **chain**, which is config, not dimension-driven lookup. **No record found** of a planned feature that needs it.
- **A Module SDK / Marketplace design (ROADMAP 2.11 / 8.7) specifying per-connector query layers as the public API third-party modules compile against.** I checked lines 1428–1454 and 2740+: the Marketplace is described as a UI Surface over the lifecycle aggregate consuming health/CB status, and the SDK section says nothing about registry facades. **No record found.** If such a design is written later, the right move is to design that API deliberately — with one interface across all four connector types, which today's four files do not have (§5) — rather than to have preserved two files that happen to be shaped roughly like it.
- **A maintainer's stated intent to standardise all module access behind per-connector facades.** That would be a legitimate architectural choice, but it is a decision to *make*, and it would require adding the missing `RegisteredModule[]` methods to the job-discovery and ai-provider facades and migrating `module.actions.ts` / `apiKey.actions.ts` / `health-monitor.ts` / `degradation.ts` — a real refactor. Measured: `moduleRegistry.` appears at **58** sites in `src/` excluding its own definition file; 14 are module self-registration (`moduleRegistry.register(...)`, which must stay direct) and 9 are inside the four facade files, leaving **35 direct query/mutation call sites** that would have to be migrated. It is not the cheap option, and nothing on record has ever asked for it.
- **Something outside this repo importing them** — not applicable; there is no published package surface.

### Incidental findings (out of scope, not fixed here)

- `CLAUDE.md:237` and `CLAUDE.md:294` both list the reference-data modules and both omit `modules/currency/`, which exists (`src/lib/connector/reference-data/modules/currency/index.ts:87` self-registers it) and is a fifth module alongside `esco-classification`, `eurostat-nuts`, `geo-codes`, `public-holidays`. Since edits 2 and 3 above touch those exact lines, that is the moment to fix it.
- `docs/ROADMAP.md:1166` records that ESCO/Eurostat were once modelled as `data_enrichment` with `supportedDimensions: []` — *"Kategorie-Hack, verletzt `DataEnrichmentManifest`-Semantik"*. That hack is what the `reference_data` ConnectorType (commit `14340a92`) was created to fix, which is useful context for why that commit exists at all — the facade was incidental to it.
