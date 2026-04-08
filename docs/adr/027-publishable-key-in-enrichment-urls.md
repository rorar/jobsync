# ADR-027: Publishable API Keys in Enrichment URLs

## Status

Accepted (2026-04-08)

## Context

The Logo.dev enrichment module constructs URLs with an embedded API token:
`https://img.logo.dev/{domain}?token=pk_xxx&format=png`

This URL is persisted in `EnrichmentResult.data` and temporarily in `Company.logoUrl`
until the `LogoAssetService` downloads the image locally. The question is whether
embedding the token in stored URLs violates the project's credential protection rules.

## Decision

**Keep the token in the URL. It is a publishable key, not a secret.**

Logo.dev API keys use a `pk_` prefix (publishable key) and are architecturally
equivalent to Stripe publishable keys, Google Maps API keys, and Mapbox access
tokens — all designed for client-side use in `<img src>` tags.

The Logo.dev API only accepts the token as a URL query parameter (`?token=`),
not via `Authorization` header. This is a design choice by Logo.dev.

### Risk Assessment (CVSS 3.1: 2.0 — Low)

| Attack Vector | Feasible? | Impact |
|---------------|-----------|--------|
| Access private data | No | Only fetches public company logos |
| Impersonate user | No | Token is billing identifier, not auth |
| Financial damage | Low | Free tier generous; paid tier has usage alerts |
| Lateral movement | No | No access to other systems |

### Why ADR-016 Does Not Apply

ADR-016 ("Three-Layer Credential URL Defense") protects **user authentication
credentials** (passwords) from appearing in browser URL bars and server logs.
Logo.dev `pk_` keys are service identifiers, not user credentials.

## Hardening Measures

1. **`sensitive: false`** on the Logo.dev manifest — honest declaration that
   `pk_` keys are publishable, preventing false positive audit flags.
2. **`Company.logoUrl` cleared after local download** — `LogoAssetService`
   sets `logoUrl: null` once `LogoAsset` status is `ready`, reducing token
   persistence from 3 DB columns to 2 (audit/re-download only).
3. **`referrerPolicy="no-referrer"`** on `CompanyLogo` `<img>` tag — prevents
   Referer header leakage during the brief external fallback window.

## Consequences

- Publishable keys in enrichment URLs are an accepted pattern
- Future enrichment modules with publishable keys follow the same rule
- Secret keys (OpenAI `sk-`, DeepSeek `sk-`) must NEVER appear in URLs —
  those remain AES-encrypted at rest, decrypted only server-side
