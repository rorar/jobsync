# Handoff — recovered session (Spotlight 2.20 / CRM contact wiring)

**Reconstructed 2026-08-05.** Original transcript was deleted by Claude Code's 30-day
session retention. This file is rebuilt from `~/.claude/history.jsonl` (user prompts only —
assistant answers are gone) plus the artifacts the session committed.

## The session

| | |
|---|---|
| sessionId | `d90ae5ba-d24c-4fb5-9198-cf5432edb468` |
| cwd | `/home/pascal` (NOT the repo — that's why `/resume` inside jobsync never showed it) |
| when | 2026-06-20, 12:04 → 15:53 |
| prompts | 38 |
| transcript | **deleted** (`~/.claude/projects/-home-pascal/d90ae5ba-*.jsonl` pruned; default `cleanupPeriodDays` = 30) |

Related sessions same day: `1e491d81` (Twenty-CRM `/understand` + Command-Menu chat),
`0ee3df59` (jobsync graph refresh), `76423fc5` (inline Contact+Company create UX note).

## What it produced (all survived)

- `docs/design/spotlight-command-palette-2.20-research.md` (365 lines) — commits `e1f686b`, `048e1fc`
  on branch **`docs-spotlight-research`**, **not yet pushed** (origin/main is at `57af088`).
  Sections: §0 code-readiness, §1 build on `cmdk`, §2 File-Manager tie-in, §3 AI-bridge + voice,
  §4 Connector/Module fit, §5 refactor prereq, Appendices A–C, follow-ups F.1–F.6.
- Earlier the same session (already merged to main): combobox a11y/loading slivers +
  CRM quick-capture provenance open question (`43c3083`), ROADMAP duplicate-2.20 fix (`57af088`).

## Where it stopped — the open thread

Last 3 prompts (15:08 / 15:32 / 15:52) were answered in chat but **never written to disk**
(doc's last write is 15:05). Unresolved:

1. Pre-plan the **File Manager** (ROADMAP 2.8) alongside Spotlight?
2. Specs + ROADMAP mention **document editing** — cover it in the Spotlight design?
3. **Decide the document story FIRST**: how does JobSync store/edit docs, what about external
   access/sync, and buy-vs-build — if pre-built, which product?

That third one is the actual blocker. Everything Spotlight-side (§0–§5) is settled.

## Resume options

- **A** — answer the doc-editing/sync buy-vs-build question, append as §F.7, push `docs-spotlight-research`.
- **B** — push the branch as-is (2 commits), then start Spotlight implementation per §"Recommended sequencing".
- **C** — first close the CRM quick-capture provenance question (`specs/crm.allium`), which gates
  the 2.20 inline-create slice.

## Prevent recurrence

`cleanupPeriodDays` is unset → 30-day default deletes transcripts. Set it in
`~/.claude/settings.json` (e.g. `365`) if long-lived sessions should stay resumable.
