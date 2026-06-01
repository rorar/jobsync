# Specification: Salary Calculator — Gross↔Net Module (Discovery)

**Track ID:** salary-calculator_20260601
**Type:** Feature (Module + discovery)
**Status:** Draft / Discovery
**Created:** 2026-06-01

## Summary

Let users express and compare salaries as **gross** or **net**, and convert between
them per country. Gross↔net conversion is country-specific (tax brackets, social
contributions, allowances) → a pluggable **Module** behind a Connector, configured by
the user in Settings + Onboarding, gated by their country and module availability.

## Origin / Requested scope (@rorar, 2026-06-01)

- **(4)** Add gross-vs-net selection to the salary input (builds on Welle 2 Phase 3
  structured salary).
- **(5)** A gross↔net calculation interface — candidate for a **Module**. Users fill
  calculation-relevant fields (tax class, state, church tax, health-insurance rate,
  age, children, etc.) in **Settings** and **Onboarding**, surfaced based on the user's
  **country** and **module availability**.
- **(7)** Discovery of npm packages / GitHub repos providing these formulae for other
  countries.

## DDD classification (apply the Module-not-Connector rule)

A gross↔net calculator is an **external/independent capability**, therefore a **Module**
— never a new Connector by reflex. Open question for the discovery spike: which
Connector type does it register behind? No existing `ConnectorType` (job_discovery,
ai_provider, data_enrichment, reference_data) cleanly covers "salary/tax computation".
Candidates to evaluate:
- A new `calculation` / `fiscal` ConnectorType (the set is open/extensible per
  CLAUDE.md DDD rules — but adding one is a deliberate architecture decision + ADR).
- Or model country tax data as `reference_data` (the formulae as reference tables) with
  a thin compute layer. Decide in discovery.

The per-country implementations are then Modules (e.g. `de-brutto-netto`,
`at-brutto-netto`), each declaring its inputs via manifest so the Settings/Onboarding
forms render dynamically (mirror the Manifest-Driven-UI / connectorParamsSchema pattern).

## Reference material (provided by @rorar — verify licences before vendoring)

Germany:
- TVData (public-service pay tables): https://github.com/Tekergo-T/TVData/tree/main
- lohntastik Brutto-Netto: https://lohntastik.de/gns/brutto-netto-gehaltsrechner
- lohntastik public-service (TV-L/TVöD): https://lohntastik.de/od-rechner/tv-gehaltsrechner/
- BMF official tax calculator: https://www.bmf-steuerrechner.de/#ui-id-5
- rechner-hub Brutto-Netto API (reference only): https://rechner-hub.de/api-dokumentation/brutto-netto/

Company car (affects net pay — see Company Perks track):
- rechner-hub Firmenwagen API (reference only): https://rechner-hub.de/api-dokumentation/firmenwagen/

## Acceptance Criteria (draft — refine after discovery)

- [ ] Discovery spike: per-country approach chosen (npm vs vendored formulae vs external
      API), licences vetted, Connector classification decided + ADR written.
- [ ] Salary input gains a gross/net selector (the field shape decided in Welle 2 Phase 3
      so this is additive).
- [ ] At least one country Module (DE) computing gross↔net from user-entered parameters.
- [ ] Settings + Onboarding surfaces the Module's required inputs dynamically (manifest-driven),
      shown only when the user's country has an available Module.
- [ ] Company-car (1% / 0.5% rule) factored where a perk affects net pay (cross-links the
      Company Perks track).
- [ ] Tests + i18n (4 locales) + best-effort/non-blocking when no Module for a country.

## Out of Scope

- Binding tax advice / legal guarantees (display estimates only; disclaimer).
- Live tax-law sync; year-over-year bracket updates handled per Module.

## Dependencies

- Welle 2 Phase 3 (structured salary: salaryMin/Max/Currency/Period) — substrate.
- GeoCode reference module (country) for country-gating.
- Onboarding-Assistent (ROADMAP 2.1) for the onboarding entry point.
- Cross-link: Company Perks track (company-car salary effect).
