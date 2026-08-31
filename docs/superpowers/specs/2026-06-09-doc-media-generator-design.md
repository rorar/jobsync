# Design: Doc-Media Generator (ROADMAP 8.1)

**Date:** 2026-06-09
**Status:** Design — awaiting review
**Author:** @rorar (brainstormed with Claude)
**ROADMAP:** 8.1 Automatische Screenshot/GIF/Video-Dokumentation

---

## 1. Summary

A code-driven tool that generates documentation media (screenshots, GIFs, videos) of
UI flows by driving the real app with Playwright and a driver.js overlay. Flows are
declared as **tour definitions** owned by the code they document (modules own their own
tours; the app owns cross-cutting tours). Output is deterministic, regenerates in CI on
UI changes, and is committed to the repo as a build artifact.

The core engine is **headless and app-agnostic** — it knows nothing about JobSync. A CLI
is its first client. An authoring UI (recorder/editor) is a future, optional **sidecar**
client over the same core. This keeps the door open to extracting the engine as a
standalone open-source product without forcing that decision now.

### Thesis (the wedge)

Existing demo tools (Arcade, Supademo, Scribe, Tango) are **record-a-human** SaaS. This
tool's differentiator is **code-driven, deterministic, CI-native, self-hosted,
git-versioned** docs media — "documentation media as a reproducible build artifact." Every
design decision below is filtered by this thesis; it auto-rejects DB-stored tours and
SaaS-studio patterns.

---

## 2. Goals / Non-Goals

### Goals
- Declare UI flows as code, co-located with the code they document.
- Regenerate screenshots/GIFs/videos deterministically (same input → same output).
- Reuse the existing Playwright + system-Chromium + storageState auth infrastructure.
- Multi-locale capture (en/de/fr/es) with zero literal strings in tour definitions.
- Keep the core engine app-agnostic and extractable to its own repo/package later.
- Exclude all of it from the production Docker image (dev-tooling only).

### Non-Goals (MVP)
- The synthetic-tween animation engine (faked cursor physics with no real DOM).
- The authoring/recorder UI (future sidecar; schema is built to accommodate it).
- The post-process compositor's premium effects (stage 2 is additive; see §6).
- Runtime end-user onboarding tours (driver.js onboarding is a *separate* ROADMAP item;
  this design only reuses the same tour *schema* so the two can converge later).

---

## 3. Architecture Overview

### 3.1 Layering

```
Layer 0  Schema (IR)         CaptureTour + MotionTrack types. The contract.
Layer 1  Core engine          Headless lib: registry + stage-1 capture + stage-2 compose.
Layer 2  CLI                  First client. CI/cron drives this. Regenerates docs.
Layer 3  Authoring UI          SIDECAR: recorder/editor. Optional, future, own package.

Dependency direction:  3 → 1,  2 → 1,  all → 0.   NEVER 1 → 2/3.
```

The volatile parts (UI, editorial flow) depend on the stable parts (schema, engine), never
the reverse — the stable-dependencies principle, mirroring JobSync's own ACL discipline
(App depends on the Connector *interface*; modules plug in).

**The CLI defines the core API by needing it.** The public surface
(`loadTours` / `capture` / `compose`) is extracted from what the CLI calls, not designed
speculatively. A future GUI is a second caller of an already-proven interface — so
"UI as sidecar" is the free consequence of "headless CLI first," not extra work.

### 3.2 Physical placement

```
tools/capture-docs/                 ← dev-only, app-agnostic core + CLI (NOT in app build)
  package.json                      ← own package.json (devDependencies only)
  src/
    schema/                         ← Layer 0: CaptureTour, MotionTrack, TourTarget, ...
    registry/                       ← TourRegistry + TourSource implementations
    capture/                        ← Layer 1 stage 1: Playwright + driver.js runner
    compose/                        ← Layer 1 stage 2: ffmpeg motion-track compositor
    cli/                            ← Layer 2: argument parsing, orchestration
docs/media/                         ← OUTPUT: screenshots/, gifs/, videos/  (committed)
src/**/tours.capture.ts             ← module-owned + app-level tour definitions (see §4)
```

`.dockerignore` excludes `tools/` and `docs/media/`. `tools/capture-docs/package.json`
deps are `devDependencies`; the Docker build uses `--omit=dev` / `standalone` output, so
end users ship none of it (per ROADMAP 8.1 separation rules).

---

## 4. Selectors & Tour Ownership

### 4.1 Selector convention — `data-capture`

The capture hook is a dedicated, namespaced attribute: `data-capture="namespace.element"`
(e.g. `data-capture="eures.location.search"`).

**Why a dedicated attribute (not reuse `data-testid` or role/text):**
- The E2E suite is role-first (547 `getByRole` vs 72 `data-testid`); `data-testid` is the
  sparse escape hatch (34 attrs / 23 files), used only for non-semantic structural
  elements. Most capture targets (settings cards, wizard fields, dashboard hero) have no
  testid — reusing it would mint 100+ new testids and pollute the test namespace with
  targets nothing tests.
- **i18n is the decisive reason.** Capture runs in 4 locales. `getByRole(..., {name})` and
  `getByText` are copy-coupled — they break when locale or wording changes. `data-capture`
  is locale-independent by construction. Role/text selectors are *worse* for capture than
  for tests.
- A distinct attribute is stripped independently in prod (separate regex), and keeps the
  question "is this tested, captured, or both?" unambiguous.

**Prod stripping:** Next.js 15.5 `compiler.reactRemoveProperties` strips matching
attributes from production builds. Add to `next.config.mjs`:

```js
compiler: {
  reactRemoveProperties: { properties: ["^data-capture$"] },
},
```

> Verify exact option shape against Next 15.5.10 before relying on it (open question Q1).
> `data-testid` stripping, if also desired, can be added to the same regex list.

**Polymorphic target — minimize new attributes.** A tour step may target via the
cheapest stable hook available:

```ts
type TourTarget =
  | { capture: string }                 // preferred: locale/refactor-safe
  | { testid: string }                  // reuse an existing data-testid
  | { role: string; name?: string };    // semantic, ONLY when i18n-stable (icons, landmarks)
```

Net-new spotlight targets get `data-capture`; flows passing through an element that already
carries `kanban-card` / `staging-list-item` reuse it.

### 4.2 Tour ownership — federated registry

Tours are **separate from markup, discovered via a registry** (not a single global file —
that breaks Module Marketplace self-containment, the same antipattern killed elsewhere in
JobSync). A capture tour is another co-located module artifact, exactly like `manifest.ts`,
`i18n.ts`, `resilience.ts`:

```
src/lib/connector/job-discovery/modules/eures/
  manifest.ts
  i18n.ts
  tours.capture.ts        ← exports CaptureTour[], self-registers
  index.ts                ← import "./tours.capture"  (side-effect, like register-all.ts)
```

Two tiers, both merged by the registry:
- **Module-owned tours** — module-scoped flows. A marketplace module ships its own demos.
- **App-level tours** — cross-cutting flows that belong to no single module (README hero,
  the full Staging → Review → Promote pipeline). Live in e.g. `src/capture/app-tours.ts`.

The registry aggregates from pluggable **sources**, so the engine never knows *how* tours
were discovered:

```ts
interface TourSource { collect(): CaptureTour[] | Promise<CaptureTour[]>; }
```

- JobSync registers a `ModuleTourSource` (reads module self-registrations) + an
  `AppTourSource` (cross-cutting tours).
- Any flat (non-module) project registers a `GlobTourSource("**/*.tour.ts")` or passes an
  explicit array in config.

Same engine, same `CaptureTour[]` output, different front door. The host app owes the tool
exactly two things: `data-capture` attributes in markup, and ≥1 `TourSource`. This is what
keeps the engine app-agnostic (and extractable — §8).

**Capture-vs-prod bundle split.** A tour tagged `channels: ["onboarding"]` is needed at
runtime in prod (end users see it); a `channels: ["capture"]` tour is dev tooling and must
stay out of the prod bundle. `tours.capture.ts` is imported only by the dev-only capture
harness (kept out of prod via the `tools/` devDeps boundary + `.dockerignore`). A tour
tagged `["onboarding","capture"]` is the DRY win: defined once, the onboarding side ships,
the capture side is read only by the harness.

---

## 5. Schema (Layer 0 — the IR)

Two schemas. A **keyframe** is authored intent (design-time, resolution-independent — a
selector + intent). A **motion-track frame** is measured fact (runtime, pixel rects at the
recorded DPI). Stage 1 reads keyframes → drives real actions → *measures reality* → emits
the motion track. Never put pixel coords in a keyframe; never put authoring intent in the
motion track.

### 5.1 Authored input (`CaptureTour`)

```ts
interface CaptureTour {
  id: string;                    // "eures.location-combobox"  (namespace.flow)
  titleKey: I18nKey;             // tour name — i18n KEY, not literal
  channels: ("onboarding" | "capture")[];
  viewport?: Viewport;           // pin; default from global config (deviceScaleFactor: 2)
  locales?: string[];            // default: all 4
  setup?: TourSetup;             // start route, auth state, seeded data (determinism)
  keyframes: Keyframe[];
}

interface Keyframe {
  id: string;                    // stable within tour, e.g. "open-combobox"
  target?: TourTarget;           // the element this frame is about
  action?: KeyframeAction;       // real DOM action to reach/at this frame (default: none)
  captionKey?: I18nKey;          // annotation copy — KEY, resolved per-locale in stage 2
  dwell?: number;                // ms to hold (default from config)
  zoom?: ZoomIntent;             // INTENT only; stage 2 resolves to a crop rect
  spotlight?: boolean;           // driver.js highlight (default: true when target+caption)
  waitFor?: WaitCondition;       // selector-visible / network-idle — determinism, no fixed sleeps
}

type TourTarget =
  | { capture: string }
  | { testid: string }
  | { role: string; name?: string };

type KeyframeAction =
  | { type: "none" }                                       // pure annotation frame
  | { type: "navigate"; to: string }
  | { type: "click"; target?: TourTarget }                 // defaults to keyframe.target
  | { type: "type"; target?: TourTarget; textKey: I18nKey } // demo text i18n'd too
  | { type: "hover" | "scrollIntoView"; target?: TourTarget }
  | { type: "press"; key: string };

type ZoomIntent = "none" | "in" | "fit-target" | { scale: number } | { rect: Rect };
type Viewport = { width: number; height: number; deviceScaleFactor?: number };
```

**Confirmed decisions:**
1. **Merged model** — one `keyframes[]` list, each carrying an optional action. A
   pure-annotation frame is `action: { type: "none" }`. (vs separate steps[]+frames[].)
2. **i18n keys, not literals** — `captionKey`, `titleKey`, `textKey`. German capture →
   German annotations *and* German typed input, reusing existing i18n. No literal strings
   anywhere in the pipeline.
3. **Real cursor coords** — Playwright logs actual mouse-move endpoints around each action
   into the motion track (`cursorFrom/To`) for stage-2 glide; not derived center-to-center.

### 5.2 Emitted facts (`motion-track.json` — the stage1→stage2 contract)

```ts
interface MotionTrack {
  schemaVersion: 1;              // versioned — cross-stage contract (cf. event-schemas.ts)
  tourId: string;
  locale: string;
  viewport: Required<Viewport>;  // actual recorded geometry
  video: { file: string; durationMs: number; fps: number };
  frames: MotionFrame[];
}

interface MotionFrame {
  keyframeId: string;
  tStartMs: number;              // offset into video
  tEndMs: number;
  targetRect: Rect | null;       // MEASURED px at recorded DPI
  cursorFrom: Point | null;      // for stage-2 glide
  cursorTo: Point | null;
  action: string;                // echoed type
  captionKey: string | null;     // KEY, not resolved text — stage 2 localizes
  zoom: { rect: Rect; scale: number } | null;  // resolved from intent + measured rect
}

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
```

> Note: the file is named `motion-track.json` (not `sidecar.json`) to avoid colliding with
> the "UI as sidecar" architectural pattern (§3). "Sidecar" = the companion UI; the data
> artifact = "motion track."

---

## 6. Capture Pipeline (Layer 1)

Two stages, bridged by `motion-track.json`. Stage 2 is **optional and additive** — MVP
ships stage 1 alone.

```
STAGE 1  (Playwright + driver.js, in-browser, ONE pass) — MVP
  walk keyframes → perform real DOM actions on data-capture targets
    ├─ native video        (real UI + driver.js spotlight + anchored callouts + real cursor)
    ├─ screenshots          (page.screenshot() per keyframe → docs/media/screenshots/)
    └─ motion-track.json    (measured: per-keyframe timing + rects + cursor coords + zoom-resolved)

STAGE 2  (ffmpeg, fed by motion-track — FUTURE, premium)
    ├─ cursor-glide layer   (bezier between recorded cursorFrom/To)
    ├─ zoom/pan crop        (per frame zoom.rect — a CROP+upscale, never in-browser)
    ├─ captions             (captionKey → locale text; swappable without re-capture)
    ├─ trim / speed ramp / transitions / branding
    └─ export               MP4 + GIF (palette downscale)  → docs/media/{videos,gifs}/
```

### 6.1 Effect placement — coupled to what

| Effect | Stage 1 (in-browser) | Stage 2 (post) | Why |
|---|---|---|---|
| Spotlight / dim mask | ✓ driver.js | | Tracks element geometry, scroll-aware |
| Anchored callout (i18n) | ✓ driver.js popover | | Glued to live element |
| Real cursor at click points | ✓ Playwright mouse | | It's real, free |
| Smooth cursor **glide** | | ✓ | Easing convincing only on frames w/ known coords |
| **Zoom / pan** (Ken Burns) | ✗ never | ✓ | CSS scale reflows + blurs text + breaks anchors |
| Captions / lower-thirds | | ✓ | Layout-independent, i18n-swappable |
| Trim / speed ramp | | ✓ | Temporal edit |
| Intro/outro, branding | | ✓ | Composition |
| GIF palette / downscale | | ✓ | Encoding |

### 6.2 Hard constraints (determinism & quality)

- **Never zoom in-browser.** CSS `transform: scale` reflows layout / re-rasterizes text and
  breaks driver.js anchor math. Zoom is a stage-2 crop+upscale of the recorded frame.
- **Record at 2× / high-DPI.** Stage 2 crops a region and upscales; only sharp with spare
  resolution. Pin `deviceScaleFactor: 2` + a fixed large viewport at capture (this also
  satisfies the reproducibility pin). Capture settings are a *contract* with stage 2.
- **Determinism:** pin viewport, force `prefers-reduced-motion`, seed data + fixed auth via
  `setup`, use `waitFor` (selector-visible / network-idle) — never fixed `waitForTimeout`.
- **Auth/data reuse:** stage 1 reuses the existing `e2e/global-setup.ts` storageState +
  `scripts/dev-e2e.sh` (the `E2E_AUTH_RATE_LIMIT_BYPASS` dev-only flag) so repeated capture
  logins don't trip the signin limiter. System Chromium at
  `/run/current-system/sw/bin/chromium` on NixOS.

---

## 7. Authoring UI — Future Sidecar (non-MVP)

A recorder/editor is a **separate sub-project** (own spec later), built as a Layer-3 sidecar
client over the core. Captured here only so the schema accommodates it.

- **~70% exists:** `playwright codegen` records real clicks, picks stable selectors, emits
  code. Harness it; don't rebuild it.
- **The editorial 30%** codegen can't give — `captionKey`, `zoom` intent, `dwell`,
  spotlight, i18n text — is human-added after recording. The schema already separates
  *recorded* fields (target, action, order) from *editorial* fields, so a recorder fills
  half and a human the other half without conflict.
- **Three tiers:** (i) hand-edit the emitted `.tour.ts` — *no UI, MVP-compatible*;
  (ii) dev-only web editor (record + reorder + annotate + export); (iii) timeline studio
  (far future, only if going product).
- **Non-negotiable:** any tier **emits a committable file** (git-diffable, PR-reviewable,
  versioned beside the UI it documents) — **never DB-stored.** A DB/SaaS-studio model would
  betray the point-1 thesis. This constraint is what keeps the recorder honest.

---

## 8. Product Extraction Path (point 1)

Build internal-first, architect for extraction; **decide product/no-product after it proves
itself on JobSync** (dogfood-then-extract):
- Core (`tools/capture-docs/src/{schema,registry,capture,compose}`) has zero `@/` / JobSync
  imports and its own `package.json`. "Internal tool" and "standalone package" are the same
  code.
- Extraction = move `tools/capture-docs/` to its own repo (`git filter-repo`), publish the
  core as a library + the CLI as a bin; JobSync becomes the first dogfooded reference user.
- The sidecar UI, if built, extracts as a second package depending on core.
- No repo split until it earns it — premature repo-splitting is premature microservices.

---

## 9. Testing

| Layer | Test |
|---|---|
| Schema | Type-level + Zod (or equivalent) validation of `CaptureTour` / `MotionTrack`; `schemaVersion` guard. |
| Registry | `TourSource` aggregation, dedupe by tour id, module + app-level merge, channel filtering. |
| Capture (stage 1) | Run a fixture tour against a fixture page; assert screenshots produced + `motion-track.json` shape (rects measured, timings monotonic, cursor coords present). |
| Compose (stage 2, when built) | Feed a known motion track; assert output dimensions, duration, caption presence. Golden-frame compare with tolerance. |
| CLI | End-to-end on one real tour (e.g. dashboard hero) in CI single-worker. |
| Determinism | Same tour twice → identical screenshots (byte or perceptual-hash within tolerance). |

Resource discipline (CLAUDE.md): single worker + `nice`; never run capture + app build in
parallel; stop the dev server before `tsc`/`jest` (capture reuses a running dev server via
`reuseExistingServer`).

---

## 10. MVP Scope vs Future

**MVP (this design's buildable slice):**
- Layer 0 schema + Layer 1 stage-1 capture + Layer 2 CLI.
- `data-capture` convention + `reactRemoveProperties` config + a handful of `data-capture`
  attributes on the first target flows.
- Federated registry (module + app-level sources).
- Output: screenshots + raw Playwright video + `motion-track.json` per tour, committed to
  `docs/media/`.
- First flows (subset of ROADMAP top-10): Dashboard hero; Staging → Review → Promote;
  Automation Wizard.
- driver.js spotlight + anchored i18n callouts in stage 1 (the in-browser overlay).

**Future phases (own specs):**
- Stage-2 compositor (cursor glide, zoom/pan, captions, transitions, GIF polish).
- Authoring UI sidecar (recorder/editor).
- Convergence with runtime onboarding tours (`channels: ["onboarding"]`).
- CI hook that regenerates media on UI-touching PRs.
- Product extraction to standalone repo.

---

## 11. Open Questions

- **Q1:** Confirm exact `compiler.reactRemoveProperties` option shape for Next 15.5.10
  (regex list vs boolean). Verify a prod build actually strips `data-capture`.
- **Q2:** driver.js as a **devDependency** (capture-only) now, promoted to a prod dependency
  later when runtime onboarding lands? Or split capture-overlay from onboarding entirely?
- **Q3:** Validation lib for the schema inside `tools/capture-docs` — reuse Zod (already in
  the app) or keep the core zero-dep for cleaner extraction? (Leaning Zod; revisit at
  extraction.)
- **Q4:** Does `tours.capture.ts` co-location risk pulling capture-only code into the prod
  bundle via shared `index.ts` side-effect imports? Confirm the dev-only import boundary
  (separate entry, or a `register-all.capture.ts` imported only by the harness).
- **Q5:** Allium spec for the tour/registry/keyframe contracts — author via `/allium` after
  this design is approved (sustainability principle: spec before complex implementation).

---

## 12. Decision Log (brainstorm)

1. Library: **driver.js** (well-maintained; converges with the planned onboarding tour lib).
2. Motion model: **hybrid** — real DOM actions (true UI) + overlay (spotlight/cursor/zoom).
3. Compositing: **two-stage** — in-browser native record (stage 1) + post compositor
   (stage 2), bridged by `motion-track.json`; stage 2 additive.
4. Schema: merged keyframe model; i18n keys not literals; real recorded cursor coords.
5. Selectors: dedicated `data-capture` (locale/refactor-safe), polymorphic fallback to
   testid/role; stripped in prod via `reactRemoveProperties`.
6. Ownership: federated registry — module-owned + app-level tours via `TourSource`.
7. Architecture: headless core + CLI-first + UI-as-sidecar; dep direction inward to schema.
8. Product: dogfood-then-extract; architect app-agnostic now, decide repo split later.
```
