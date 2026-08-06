# §F.7 — Open Threads Reference (Dokument-Story + CRM Company-Link)

**Status:** Reference only. Nothing here is decided. Collected 2026-08-05.
**Extends:** `docs/design/spotlight-command-palette-2.20-research.md` (§F.1–F.6 there; this file is the F.7 companion).

---

## 0. Provenance — why this file exists

The research doc's last write was 2026-06-20 15:05. The originating session
(`d90ae5ba-d24c-4fb5-9198-cf5432edb468`, cwd `/home/pascal`, 12:04–15:53) continued past that
point with three more questions that were answered in chat but **never persisted**. The session
transcript was later deleted by Claude Code's 30-day retention (`cleanupPeriodDays`, now raised
to 365), so the answers are gone. What survived is the user-prompt log in
`~/.claude/history.jsonl`, from which the questions below are quoted verbatim.

Everything in §2 is therefore **re-derived from the repo**, not recovered — treat it as fresh
research that happens to answer the same questions.

---

## 1. The three unanswered questions (verbatim)

From the recovered prompt log:

| Time | Question |
|---|---|
| 15:08 | "Should we plan the filemanager as well? Or at least pre-plan it?" |
| 15:32 | "Have a look at the specs and ROADMAP.md we plan to integrate document editing. Should we cover that as well?" |
| 15:52 | "Shouldn't we decide the way we implement and edit docs in JobSync first? What about external access/sync? Should we use pre-built software or built something our own? If pre-built software: Which one?" |

Q3 is the blocker: it gates both the File-Manager pre-plan (Q1) and the doc-editing scope of
the Spotlight design (Q2).

---

## 2. What the repo already answers

The buy-vs-build question is **partially pre-decided by the ROADMAP** — three separate entries
already carve the document domain into distinct concerns. This is the most important finding:
the domain is not a single "docs feature", it is four.

| Concern | ROADMAP | Current stance in repo |
|---|---|---|
| **Store / sync externally** | `1.6 Dokumentenworkflow Connector` (`docs/ROADMAP.md:596`) | **Buy, don't build.** Module: Paperless-ngx. "Dokumente aus JobSync an Paperless-ngx senden/empfangen", auto-filing by tag/correspondent schema, **bidirektionale Synchronisation.** |
| **Understand / parse** | `1.18` (`docs/ROADMAP.md:1103–1125`) | Separate connector. Explicit boundary stated at `:1125`: 1.6 = *lagern/synchronisieren*, 1.18 = *verstehen*. "Null Interface-Überschneidung." |
| **Manage files in-app** | `2.8 Datei-Management` (`docs/ROADMAP.md:1393`) | Build. Upload, Dateiexplorer (organise/rename/delete), share via e-mail / portals / QR. |
| **Generate + edit content** | `4.2 Dokumenten-Generatoren` (`docs/ROADMAP.md:1920`) | Build, spec exists: `specs/application-documents.allium` (DRAFT 2026-06-14, `allium check` green). Lifecycle `draft→generated→edited→final`. The `edited` state is where "document editing" lives. |

**Consequences for Q3:**

- *External access/sync* → already answered: **Paperless-ngx via the 1.6 connector**, following the
  project's Module-behind-Connector rule. No new decision needed, only sequencing.
- *Pre-built vs own, for editing* → **not** the same question as storage. Editing is the `edited`
  state of `GeneratedDocument` in `specs/application-documents.allium`, i.e. in-app.
- *In-app editor component* → the repo already leans on **Tiptap** (referenced as ROADMAP 3.3 in the
  research doc's F.1 "in-editor slash menu" borrow). If Tiptap is the editor, the Spotlight
  Action-Registry gets a second consumer for free: global `⌘K` + in-editor `/` menu, one registry.

**Still genuinely open after this:**

1. Does an `ApplicationFile` / `Attachment` (4.2, G3) get edited in place, or only regenerated?
2. Does the 2.8 Dateiexplorer surface Paperless-ngx-synced files, or only local `{DATA_DIR}` files?
   (Storage paths: `src/lib/storage.ts` → `getResumesDir()`, `getLogosDir()`.)
3. Does the Spotlight palette expose doc *actions* (open/generate/share) before 4.2 ships, or is
   the doc tier gated on 4.2? The research doc §"Spec scope" already gates doc-export actions on 4.2.

**Recommendation (not a decision):** answer 2 and 3 as part of the Spotlight spec — they are
palette-scope questions. Answer 1 inside `application-documents.allium` via `/tend`, where the
lifecycle already lives. Do **not** re-open storage: 1.6 settled it.

---

## 3. CRM Company-Link — verified gap

Independent finding from the same investigation, kept here because it was the other half of what
the lost session was about.

**The building block exists but is not wired into the contact form.**

| Fact | Evidence |
|---|---|
| `CompanyPicker` is a real combobox, emits a company **ID** | `src/components/crm/CompanyPicker.tsx:30` — `onValueChange: (companyId: string) => void` |
| It is wired into exactly one place: Inside-Track tip capture | `src/components/inside-track/TipCaptureForm.tsx:199` |
| `CompanyAssociation` carries `companyId` | `src/models/person.model.ts:29-43` |
| `PersonForm` renders a **plain text Input** for the company, not the picker | `src/components/crm/PersonForm.tsx:455-460` |
| New associations are created with an empty id | `src/components/crm/PersonForm.tsx:180` — `companyId: ""` |
| Only the label is validated on submit | `src/components/crm/PersonForm.tsx:222` — `companies.filter(c => c.companyLabel.trim() !== "")` |
| Warm-path lookup matches on **exact id** | `src/actions/warmPath.actions.ts:57-83` — `parseCompanies(c.companies).find(a => a.companyId === companyId)` |

**Impact:** a contact whose employer was typed into the contact form keeps `companyId: ""` and is
therefore invisible to `findWarmPaths()`. The Inside-Track path works; the CRM path does not.

**Already tracked as open, not a new finding:**

- `docs/BACKLOG.md` §G — "inline quick-create in pickers (ContactPicker/CompanyPicker) — today
  select-existing only. Needs minimal-capture quick-form. Complements ROADMAP 2.20/2.16."
- `docs/BACKLOG.md` §G — combobox consolidation onto `src/components/ui/base-combobox.tsx` must
  enhance BaseCombobox **first**, else a11y regress. One cross-cutting pass.
- `specs/crm.allium:1416-1433` — open question on quick-capture provenance.
  `(d) Sequencing: lock this provenance decision BEFORE the 2.20 quick-create UI ships.`

**Scope note:** the crm.allium open question is about **Person** quick-create from a picker.
Creating a **Company** inline is the adjacent case and is not covered by that question's text —
but it lands on the same provenance axis (`Company.domain` auto-fill already happens event-driven
via `CompanyCreated` → `enrichment-trigger.ts`), so it deserves an explicit call rather than an
implicit one.

Server action for company creation already exists: `addCompany` in
`src/actions/company.actions.ts:109` (plus `getAllCompanies:75`, `updateCompany:167`).

---

## 4. Reference index

**JobSync**
- `docs/design/spotlight-command-palette-2.20-research.md` — §0–§5, Appendices A–C, F.1–F.6
- `docs/ROADMAP.md` — 1.6 (`:596`), 1.18 (`:1103`), 2.8 (`:1393`), 2.20 (`:1708`), 4.2 (`:1920`)
- `specs/application-documents.allium` — GeneratedDocument lifecycle incl. `edited`
- `specs/crm.allium:1416` — quick-capture provenance open question
- `specs/base-combobox.allium`, `specs/ui-combobox-keyboard.allium` — the 2026-06-20 slivers
- `docs/BACKLOG.md` §G — picker quick-create + combobox consolidation

**External (patterns only — see F.5 licensing: Twenty is AGPL, ideas only, never code)**
- Twenty CRM: `/home/pascal/projekte/twenty/` + its Understand-Anything graph
- cmdk (MIT) — already a dependency

**Graph caveat:** the Twenty graph at `/home/pascal/projekte/twenty/.understand-anything/meta.json`
is anchored to commit `459c64f6…`, while that repo's HEAD is a single squashed snapshot commit
`78577c0f`. The anchor is not verifiable against current history → treat every node/edge as a
**hypothesis** and grep the file before relying on it.
