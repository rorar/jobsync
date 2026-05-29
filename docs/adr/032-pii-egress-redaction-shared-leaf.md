# ADR-032: PII Egress Redaction Centralized in a Dependency-Free Leaf (`src/lib/pii`)

## Status

Accepted (2026-05-29)

## Context

GDPR Art. 5(1)(c) data minimisation requires redacting direct identifiers from resume/job free-text before it is transferred to a non-local (cloud) AI provider (OpenAI/DeepSeek). The redaction logic was duplicated across the two resume → text converters:

- `convertResumeToText` (`ai-provider/tools/preprocessing.ts`) — the interactive route path (resume review + job match)
- `convertResumeForMatch` (`job-discovery/runner.ts`) — the automation-runner match path

Each carried its own inline `stripPii ? "[NAME]" : …` logic and its own `scrub` closure over `stripEmailPhonePatterns`. This duplication was not theoretical: it produced a real leak — the runner converter shipped **without redaction** and sent full resume + job text to the user's (possibly cloud) AI module on every scheduled AI-scored run (GDPR S3 flashlight finding, fixed in `803212b`). The two converters had also drifted (the route path redacts `[ADDRESS]`; the runner omits address entirely).

Question: how to eliminate the duplication **class** — so a future egress sink cannot reinvent or forget redaction — without changing the per-converter prompt layout (the two converters feed different LLM prompts; changing either's text would shift model behaviour / match scores).

## Decision

Extract the redaction **policy** (not the layout) into a new dependency-free leaf module `src/lib/pii`:

- `redactContact(contact, stripPii)` → structured contact redacted to `[NAME]/[EMAIL]/[PHONE]/[ADDRESS]`
- `scrubFreeText(text, stripPii)` → free-text email/phone scrub (replaces the three former `scrub` closures)
- `stripEmailPhonePatterns(text)` → the ReDoS-bounded scrubber (moved verbatim; `text-processing.ts`/`preprocessing-job.ts` now re-export it)
- `PII_PLACEHOLDERS` → the canonical placeholder tokens

Both converters keep their **distinct text layout** (route = flat `Name:`; runner = Markdown `## CONTACT`) but source every redaction decision from `src/lib/pii`. The leaf imports nothing internal. `redactContact` accepts a structural `RedactableContact` subset (`firstName/lastName/email/phone/address?`), so it bridges the two different `ContactInfo` input types (`Resume` profile.model vs the runner's inline `ResumeWithSections`) with **no cast**. The `stripPii = !isLocal` gating (fail-safe: redact when locality is unknown) is unchanged at all three AI-transfer sites.

## Consequences

### Positive

- Single source of truth: any new egress sink must route through `src/lib/pii`; the per-converter redaction-drift class is eliminated.
- Byte-identical converter output → no prompt/behaviour regress. Verified by the existing regression guards (`preprocessing-pii`, `runner-pii-redaction`, `text-processing` specs) + a 3-dimension review (correctness/security/architecture), all confirming output equivalence line-by-line.
- True zero-dependency leaf → no dependency-cycle risk (cf. the `enforced-writer.ts` cycle-break precedent). Enforced mechanically by a leaf-invariant test in `__tests__/pii-redaction.spec.ts`.
- Placeholder tokens defined once, matching the Allium invariant text exactly.
- The structural-typing bridge fails at compile time (not silently mis-redacts) if either source `ContactInfo` drops/retypes a field.

### Negative

- Two converter functions remain (one per prompt layout): the duplication of *layout* persists by design — only the redaction policy is shared. A reader might mistake the two for mergeable.
- The converters' `stripPii` parameters still default to `false` (unsafe-by-default if a future caller omits the flag). Pre-existing; unchanged by this decision.

### Mitigations

- Inline comments on both converters state why two functions exist (different prompts) and that they must NOT be merged (would change prompt text → behaviour regress).
- `CLAUDE.md` § "PII Egress Redaction (`src/lib/pii`)" + `specs/ai-provider.allium` `@invariant CloudTransferDataMinimization` document the chokepoint rule as the authoritative contract.
- The new shared primitives (`redactContact`, `scrubFreeText`) take a **required** `stripPii` argument, so the floor is raised: the shared layer cannot be called without an explicit decision, even though the converter wrappers retain their legacy defaults.
- `docs/gdpr-audit-report.md` S3 records the DSAR/RoPA third-party-recipient declaration (OpenAI/DeepSeek as processors) enabled by this consolidation.

## Alternatives Considered

1. **Merge both converters into one `convertResume` with a layout parameter** — rejected: would change one path's prompt text → LLM behaviour / match-score regress requiring an eval; over-parameterised for two call sites. Sharing only the redaction decision achieves the deduplication goal without touching prompts.
2. **Place the shared redaction inside `connector/ai-provider/tools`** — rejected: the runner (a `job-discovery` bounded context) would then reach sideways into a sibling context for a GDPR primitive (ACL violation). A shared-kernel leaf at `src/lib/pii` is the DDD-correct home, consumed by both contexts (matches `src/lib/storage.ts`, `src/lib/encryption.ts`, `enforced-writer.ts`).
3. **Import `ContactInfo` from `models/` into the leaf** — rejected: creates an import back-edge that undermines the zero-dependency property. A hand-written structural `RedactableContact` subset achieves the bridge with a compile-time safety net and no coupling.

## Related ADRs

- **ADR-026** (Multi-Channel Notification Architecture) — the webhook channel is the *other* third-party egress sink; it uses a complementary **allowlist** (`filterWebhookData`), not this scrubber. Different sink, different mechanism, same Art. 5(1)(c) goal.
- **ADR-028** (Self-Contained Modules) — same dependency-hygiene philosophy; `src/lib/pii` is the leaf-module pattern (zero internal imports) applied to a cross-cutting GDPR policy rather than to a connector module.
- **ADR-017** (Per-Record Random Encryption Salt) — the adjacent but **distinct** privacy axis: ADR-017 protects PII *at rest*; ADR-032 minimises PII *in transit* to third parties. PII-at-rest field-level encryption remains a separate, deferred workstream.

## Reversibility

Low-risk and reversible: the change is a behaviour-preserving extraction (byte-identical converter output, verified). Reverting means re-inlining the redaction helpers into each converter — but doing so would reintroduce the duplication class that caused the original runner leak, so the leaf is the preferred steady state. The leaf-invariant test guards against silent erosion (a new internal import fails CI).
