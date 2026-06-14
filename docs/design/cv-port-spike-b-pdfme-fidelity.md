# Spike B — pdfme Template Fidelity (CV PDF engine go/no-go)

**Date:** 2026-06-14 · **Context:** ROADMAP 4.2.2 (CV-Manager replacement, engine = pdfme decided) · **Goal:** prove pdfme can reproduce the cv-manager look from a `CvDocument` JSON (Spike A), in-process, no sidecar.

**Method:** real runnable prototype — `@pdfme/generator` + `@pdfme/schemas` v6 installed in a scratch dir, rendered a CV-shaped template (text + multiVariableText + **svg branch-curve timeline** + **multi-row table**) to PDF. Not just analysis.

---

## 1. cv-manager signature visuals (what must be reproduced)
- **Branch-curve SVG timeline** (`computeTimelineBranches`/`renderBranchCurves` in `scripts.js`): main line + forked branch tracks for overlapping/parallel roles, drawn as cubic-bezier `<path>` + node circles. The hardest, most distinctive element.
- Two-column / flex layout, section cards, experience **highlights[]** bullets, skill chips with **icons**, certifications, projects.
- Typography: **Inter** font; CSS custom properties (brand blues `#0066ff`/`#00a3ff`/`#001a4d`, radii, shadows, gradients); `@media print` styles.

## 2. Smoke-test result (PASS)
```
OK in-process generate | bytes: 16595 | header: %PDF- | pages: 2 | A4 595×842pt
```
- ✅ **In-process** — clean `npm install` (39 pkgs), no native build, no browser, runs in Node/Next runtime.
- ✅ **SVG timeline embeds faithfully** — the `svg` schema takes an arbitrary `<path>`/bezier/circle SVG string and renders it as **vector**. pdfme does NOT *draw* the timeline; it *embeds* an SVG we generate server-side (identical mechanism to the report Sankey, ECharts/d3 → static SVG). So timeline fidelity = our SVG generator, not a pdfme limit.
- ✅ **Table auto-paginates** — 28 rows → 2 A4 pages.
- ✅ **multiVariableText** templating (`{title} — {subtitle}`).

## 3. Gotchas / learnings (carry into implementation)
1. **Object `basePdf` is mandatory for flow.** `basePdf: { width, height, padding }` enables re-layout + page-breaks. `BLANK_PDF` or a custom background PDF **disables pagination** (pdfme warns: "cannot use page breaks or re-layout"). → CV uses `{ width:210, height:297, padding:[…] }` (A4 mm). Fixed-background PDFs only for form-fill (1.9 Arbeitsagentur forms).
2. **Don't hand-author schema styles.** A raw table schema crashed (`undefined alignment` / `padding.right`) until built by spreading `table.propPanel.defaultSchema`. The **Designer (`@pdfme/ui`) supplies the full style object** — so templates should be authored in the Designer / `@pdfme/jsx`, then stored as JSON; raw-by-hand JSON is error-prone.
3. **SVG = embed, not CSS.** The branch-curve timeline must be pre-rendered to static SVG (server-side, no JS at PDF time). Already our pattern.
4. **Fonts:** Inter must be **registered** via pdfme's font option (fontkit) for exact typography — default is Roboto/Helvetica. Standard pdfme feature, one-time setup; not a blocker.
5. **Layout = coordinate/schema, not CSS flow.** Two-column/magazine look = positioned schemas / `@pdfme/jsx` `Stack` — manual layout work, NOT a CSS port. The Designer makes this tractable but it is a *rebuild*, not a 1:1 HTML transfer.

## 4. Verdict — **GO (pdfme), with caveats**
- The single biggest risk (the branch-curve timeline) is **solved** via SVG-embed, because we generate the SVG ourselves.
- Tables, sections, text, chips (rectangles), icons (svg/image), pagination, multi-locale — all map to built-in schemas, proven to run in-process.
- **Caveat:** pixel-perfect match to cv-manager's exact CSS is NOT free. The template is **rebuilt in pdfme's model** (Designer/`@pdfme/jsx`), accepting minor deviations. Budget design time for the layout rebuild + Inter registration.
- **Fallback unchanged:** if a future design needs true CSS-flow that's painful in pdfme, Gotenberg (HTML-first) remains the documented escape hatch (4.2.1). Not needed for the cv-manager-class CV.

## 5. Resulting implementation notes
- Engine: **pdfme in-process**, object A4 basePdf, Inter registered.
- Templates authored via **`@pdfme/ui` Designer** (also satisfies 4.2 user-template-management), stored as JSON (per-user, versionable → `shared-surface`).
- Timeline + any chart: server-render to static SVG → pdfme `svg` schema.
- Data: render from `CvDocument.data` (JSON Resume, Spike A) → template `inputs`.
- Open follow-up: build the actual cv-manager-equivalent Designer template + Inter font asset; validate visual against originals with a human eye (this spike proved capability, not final pixels).

**Reference prototype:** `docs/design/cv-port-spike-b-pdfme-prototype.mjs` — the validated known-good render script (encodes all 5 gotchas above as runnable code). Not wired into the build; run standalone per its header. Starting point for the implementation template.
