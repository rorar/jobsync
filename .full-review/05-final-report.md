# Comprehensive Review — PII-Egress-Härtung-Sprint (2026-05-29)

## Target

Behavior-preserving refactor (~60 LOC): extract duplicated PII-redaction logic from the
two resume converters into a new dependency-free leaf `src/lib/pii/`. Files: `src/lib/pii/index.ts`
(new), `preprocessing.ts`, `preprocessing-job.ts`, `text-processing.ts`, `runner.ts`,
`specs/ai-provider.allium`, `docs/gdpr-audit-report.md`, `__tests__/pii-redaction.spec.ts`.

## Execution (lean, right-sized)

Per user "lean / no ceremony" + prior GDPR S3 precedent, ran the 3 relevant dimensions in
parallel instead of the full 8-agent / 5-phase ceremony (perf trivial — same regex, no DB/IO;
testing + docs done in-sprint; CI/CD N/A). All findings cited file:line and were verified
against the actual diff (feedback_verify_agent_claims).

## Findings

**Correctness (code-reviewer): CONFIRMED OK — all 5 properties.**
- `redactContact` reproduces both old inline contact-redaction paths byte-for-byte, incl. placeholders.
- Render-guard parity verified for empty-string / null / present address (guard stays on original field; `r.address` only read inside the guarded branch → byte-identical).
- `scrubFreeText` == old `strip ? stripEmailPhonePatterns(t) : t` for all 3 former closures.
- `stripEmailPhonePatterns` moved verbatim — email/phone regex + `>=7`-digit gate + ReDoS bounds identical.
- `stripPii = !isLocal` gating flow into converters unchanged.

**Security (security-auditor): CONFIRMED OK — coverage fully preserved.**
- No redacted field dropped; gating intact + fail-safe (`?? false` ⇒ unknown locality ⇒ redact) at all 3 AI-transfer sites.
- Regex byte-identical, ReDoS-bounded. New leaf is pure: zero imports, no logging/persistence/transmission.
- **LOW / pre-existing (NOT fixed, out of scope):** converter-layer `stripPii = false` defaults are unsafe-by-default *if* a future caller forgets the arg. Unchanged by this diff; all current callers pass it explicitly; new shared primitives *require* the flag (improves the floor). Spec's fail-safe correctly lives at the `isLocal ?? false` call sites.

**Architecture/DDD (architect-review): PASS — sound, no defects.**
- True zero-dependency leaf (stricter than `enforced-writer.ts`); all 4 consumer edges point inward; no back-edge possible.
- `src/lib/pii` is the DDD-correct shared-kernel home (consumed by both ai-provider AND job-discovery contexts; placing it in ai-provider would force a sideways ACL reach from the runner).
- Policy-shared / layout-per-converter is the correct seam; the two converters are NOT safely mergeable (different prompt layouts). Structural-typing bridge (`RedactableContact`) is sound — compile-time safety net, no cast, preserves the zero-import property.

## Action taken

- **Adopted** the one sustainable hardening both reviewers converged on: a self-enforcing
  leaf-invariant test (`pii-redaction.spec.ts` → "leaf-module invariant") asserting `src/lib/pii`
  imports nothing internal. Converts the zero-import property from convention → checked invariant
  (mirrors `scripts/check-notification-writers.sh`). Green.
- **Documented** the converter-default note as a known/accepted residual (pre-existing, not reachable unsafely).

## Verdict

0 Critical / 0 High / 0 real Medium. 1 LOW pre-existing note (documented). Refactor is
behavior-preserving and output-equivalent. Ready for Honesty Gate.
