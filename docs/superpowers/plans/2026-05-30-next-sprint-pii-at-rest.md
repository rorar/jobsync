# Next Sprint — PII-at-Rest (+ bundled (D) cleanups) — Startprompt

> Created 2026-05-29 at close of the PII-Egress-Härtung-Sprint. Egress redaction is now
> complete (all sinks inventoried); the next coherent privacy axis is **PII-at-rest**.
> This bundles the deferred (D) items + the optional converter-default hardening.
> **VERIFY each item against current code before starting** (`feedback_verify_index_against_code`:
> indexes lag code in BOTH directions — don't trust "open" *or* "done" without a grep).

## Process (unchanged, PFLICHT)

- `/full-stack-orchestration:full-stack-feature` (lean where surgical) → TDD throughout → Allium ZUERST → `/comprehensive-review:full-review` (right-sized) + **Flashlight (project-wide grep, not just diff)** + blind-spot → fix all findings, verify each agent "fixed" claim vs `git diff` → **Honesty Gate before push** (no push without explicit go). @rorar, `origin/main` only (fork), no upstream PRs. Tests `nice -n 10 … --maxWorkers=1`, never tests+build parallel, stop dev server before `tsc`.
- **Understand-Anything graph hygiene (CORRECTED — the earlier "post-commit hook → `/understand --auto-update`" note was wrong):** `--auto-update` is only a *config toggle*, and the plugin's skills are interactive (LLM-driven) — a git hook / CI **cannot** invoke them headlessly. The real safeguards are now in place:
  - `.claude/settings.json` **SessionStart hook** runs `scripts/understand-staleness-check.sh` → reports if the committed graph is stale vs `HEAD` + lists untrusted files (no LLM, no regen).
  - Refresh, when needed, is an **in-session** `/understand-anything:understand` run (it auto-detects changed files and updates incrementally).
  - **FEEDING RULE in CLAUDE.md** governs priming subagents with graph content (stamp freshness + verify-against-code). `allium:weed` stays authoritative for spec↔code drift — the graph is navigation/impact only.

---

## PRIMARY: PII-at-Rest — Person PII field-level encryption

[vorbestehend, GDPR-Audit 2026-05-12; SEPARATE Storage/Krypto-Achse — bewusst NICHT im Egress-Sprint]

**Problem:** `Person` aggregate stores direct identifiers in **plaintext** (SQLite). `emails`/`phones`/`companies`/`socialProfiles` are JSON TEXT; `addressCountryCode`/`addressSubdivisionCode` and name fields likewise. GDPR Art. 32 (security of processing) argues for encryption at rest of contact PII.

**Design questions to resolve FIRST (Allium + DDD before code):**
- **Which fields** truly need field-level encryption (names/emails/phones/address) vs which stay plaintext (country code for holiday/geo lookups, which must remain queryable)?
- **Search/sort/filter impact:** encrypting a field breaks `WHERE`/`ORDER BY`/dedup on it. CRM list/search currently filters Persons — encrypting email/name breaks server-side search. Decide: blind-index (HMAC) for equality lookups, or accept client-side-only filtering, or keep a searchable normalized hash column.
- **Key management:** reuse `src/lib/encryption.ts` (AES-256-GCM, PBKDF2, per-record salt). Same `ENCRYPTION_KEY` env. Decryption only server-side (`import "server-only"`).
- **Migration:** backfill existing plaintext → encrypted (DRY_RUN-able script, per-row try/catch, like `migrate-person-address-country-codes.ts`). Reversible plan.
- **Anonymize/merge interplay:** `AnonymizePerson` must still work on encrypted fields; `MergePersons` must decrypt→re-encrypt.
- Effort: **multi-day** (design + migration + repo-wide read/write call-site updates + tests). Likely its own focused sprint; the (D) items below can ride along OR be a separate small pass.

**Allium:** `crm.allium`, `crm-gdpr.allium`, `security-rules.allium`, `api-key-management.allium` (encryption rules). Write/extend spec BEFORE code.

---

## BUNDLED (D) — pre-existing cleanups in adjacent domains (verify each vs code first)

1. **`runner.ts` `experimental_output` deprecation** (AI SDK) — `result.experimental_output` (~runner.ts:772) is deprecated. Migrate to the current AI-SDK output API. LOW.
2. **`runner.ts` `resume as ResumeWithSections` cast** (~:425) — the runner casts its Prisma query result. Could be tightened to a typed query result now that redaction is structurally bridged. LOW.
3. **`notification-dispatch.allium` 160 parse errors (Allium v3)** — dedicated `allium:tend` session to migrate the spec to v3 syntax. MEDIUM, isolated.
4. **`shared-entities.allium` Company.domain drift** — spec vs code divergence on `Company.domain`; reconcile via `allium:weed`. LOW-MEDIUM.
5. **enrichment-trigger A-05 bounded-context violation** — `enrichment-trigger.ts` writes `Company.domain` directly (cross-context write). Route through the Company aggregate's repository instead. MEDIUM (DDD).

---

## OPTIONAL hardening (from the Egress sprint review)

6. **Converter-default fail-safe** — flip `stripPii = false` → `true` defaults on `convertResumeForMatch`/`convertResumeToText`/`matchJobToResume`/`convertJobToText` so the converter layer is fail-safe too (a future caller that forgets the flag redacts rather than leaks). Pre-existing; all current callers pass the flag explicitly and the shared `src/lib/pii` primitives already require it, so this is belt-and-suspenders. ~30 min + test that the default path redacts. Documented in ADR-032 / `.full-review/05-final-report.md`.

---

## Recommended order

1. **PII-at-rest design phase** (Allium + the 5 design questions) — this is the real work; don't start code until the search/key/migration strategy is decided.
2. While that design is settling, knock out the cheap (D) items as a warm-up: **#6 (30 min)** → **#1/#2 (runner LOW)** → **#5 (enrichment A-05, DDD)**. The two Allium items (#3/#4) are best as their own `allium:tend`/`weed` pass.
3. Then implement PII-at-rest behind the agreed design.

Honest note: PII-at-rest is a large, risk-bearing migration; the (D) items are small and unrelated. Bundling them in one *prompt* is fine (this doc), but they likely want **separate commits/streams** — don't conflate the crypto migration with the cleanups.
