# Changelog

## [2026-04-01] Session S1a — Allium Weed + Gap Analysis + Performance Fixes

### Fixed
- **perf:** lastUsedAt DB writes throttled to max 1 per 5 minutes per key (PERF-1)
- **perf:** Dedup job URL query bounded to 90-day window (PERF-2)
- **perf:** Rate limiter Map capped at 10,000 entries with LRU eviction (PERF-3)
- **i18n:** 16 hardcoded English strings in automation detail page (A9)
- **ux:** Run Now tooltip explains all disabled states — running, paused, resume missing (B6)

### Added
- `src/lib/api/last-used-throttle.ts` — reusable DB write throttle utility
- `__tests__/last-used-throttle.spec.ts` — 7 unit tests for throttle logic
- `docs/gap-analysis-sprint-abc.md` — Sprint A/B/C gap analysis (24/24 items DONE)

### Changed
- Allium specs updated for spec-code alignment (19 specs weeded)

## Sprint C (2026-03-31)

### Features

* **api:** Public API v1 Foundation (ROADMAP 7.1 Phase 1) — REST endpoints for Jobs CRUD + Notes with API Key auth, SHA-256 hashing, in-memory rate limiting (60 req/min), Zod validation, CORS, and ActionResult→HTTP bridge
* **api:** API Key Management UI in Settings — create/copy/revoke/delete keys with i18n (en/de/fr/es)
* **blacklist:** Company Blacklist (ROADMAP 2.15) — block companies from staging pipeline with name/pattern matching, Settings UI
* **cache:** Response Caching Stufe 1 (ROADMAP 0.9) — in-memory LRU cache for external API responses with HTTP cache headers on ESCO/EURES proxy routes
* **staging:** JobDeck swipe UI (ROADMAP 2.7 Phase 1) — card-based vacancy review with dismiss/promote/superlike actions, undo support, and Tailwind animations

### Security

* **api:** IDOR prevention on resume/tag ID associations (ownership validation)
* **api:** Max length constraints on all API input fields
* **api:** Cache-Control: no-store + X-Content-Type-Options: nosniff headers
* **api:** Per-user API key limit (max 10 active)
* **api:** Revoke-before-delete enforcement on API keys
* **security:** 25 vulnerability fixes — IDOR ownership checks, credential URL defense, auth secret fail-fast, input validation (SEC-1 to SEC-18, BS-1 to BS-7)

### Bug Fixes

* **jobs:** `resumeId: ""` caused P2003 FK constraint error when no resume selected — changed to `null`

### Testing

* **e2e:** Repaired all 68 E2E tests (was 8/68 passing) — stale data cleanup, networkidle→domcontentloaded, EURES→Arbeitsagentur, locale cookies, timing fixes, startTransition waits
* **e2e:** Playwright workers optimized: 3 default, 1 CI (was 4/7)

### Documentation

* **specs:** 10 Allium specifications distilled from codebase
* **security:** STRIDE threat model, ADRs 015-018, upstream bug reports
* **roadmap:** ROADMAP 8.5 E2E Repair completed

## [1.1.3](https://github.com/Gsync/jobsync/compare/v1.1.2...v1.1.3) (2026-02-28)



## [1.1.2](https://github.com/Gsync/jobsync/compare/v1.1.0...v1.1.2) (2026-02-28)


### Bug Fixes

*  display user email in profile dropdown instead of static text

### Other Changes

*  replace release-please workflow with local release script
*  release 1.1.1


## [1.1.1](https://github.com/Gsync/jobsync/compare/v1.1.0...v1.1.1) (2026-02-28)


### Bug Fixes

* **ui:** display user email in profile dropdown instead of static text ([2fee6ee](https://github.com/Gsync/jobsync/commit/2fee6eeb8b041db26a20d72f1b24485fec51f030))
* **ui:** display user email in profile dropdown instead of static text ([bc39aa5](https://github.com/Gsync/jobsync/commit/bc39aa5bbda8dfa91fcb8e404b9cc68c2eec5674))

## [1.1.0](https://github.com/Gsync/jobsync/compare/v1.0.0...v1.1.0) (2026-02-28)


### Features

* add release automation ([6fd8247](https://github.com/Gsync/jobsync/commit/6fd8247f836208d61eddae935c4cbd63fac36cde))


### Bug Fixes

* Add job draft date in job details ([f6c2bb6](https://github.com/Gsync/jobsync/commit/f6c2bb65f14364f1292ecccf66c4f2999ba5cfc6))
* Admin tab switch ([8c57052](https://github.com/Gsync/jobsync/commit/8c5705297c643a13c9d00da34a45d7d85f785f23))
* bullet and order styling of editor content ([423b0f4](https://github.com/Gsync/jobsync/commit/423b0f43d0cfff76e1522864bd1b5177773692fb))
* button hydration error ([d7e97a0](https://github.com/Gsync/jobsync/commit/d7e97a014e2d41ccdb1cd77d6baa0b6975576f4b))
* Combobox filter issue ([1ab477e](https://github.com/Gsync/jobsync/commit/1ab477eb6e64f0aab7da360fcc936897217583e5))
* Combobox undefined error ([fdaa9fe](https://github.com/Gsync/jobsync/commit/fdaa9fe72c35695136871a8e92fb5311af52a476))
* configure release-please to target dev branch ([9ca7db0](https://github.com/Gsync/jobsync/commit/9ca7db003a5fb2d0ef4484a223aa7511eb84c08b))
* Create company bug when adding experience ([c992077](https://github.com/Gsync/jobsync/commit/c99207744f8f038ad490d10dba581dba8c13d960))
* DatePicker bug in Safari browser ([0f24106](https://github.com/Gsync/jobsync/commit/0f24106ebe5fabbd65336e2de128a623d3406099))
* Dialog scroll ([93f8e7d](https://github.com/Gsync/jobsync/commit/93f8e7dbec477b14c924ea0f819283c9a1f142f0))
* Edit company ([d7a15e2](https://github.com/Gsync/jobsync/commit/d7a15e293345e8097a43e9e4128b1e5a07ff024b))
* Error accessing ollama api endpoint in docker ([83aa24a](https://github.com/Gsync/jobsync/commit/83aa24a5ec8f503c1f2c758e4fb5ec5d2506bcc4))
* Failing Tasks playwright tests ([4c2cecf](https://github.com/Gsync/jobsync/commit/4c2cecf95c77106b7f6fafd2ded8ca4c16822d9c))
* hydration error, minor refactor ([6d2db31](https://github.com/Gsync/jobsync/commit/6d2db31ebde9ee6afc426f8ece397145becfe731))
* job status undefined issue ([91d3097](https://github.com/Gsync/jobsync/commit/91d309762d87f863ffd481b6c720b91ee8e21c5a))
* jobsApplied based on applied field ([d0ad166](https://github.com/Gsync/jobsync/commit/d0ad166a291477bd53663d59165a40bc6af203cb))
* login error validation ([7df090a](https://github.com/Gsync/jobsync/commit/7df090a6b899b89394d29722f7f247730b2b8713))
* minor layout issues ([55e1e42](https://github.com/Gsync/jobsync/commit/55e1e42d38e26c74ff675f0a761cabe40cde7cb2))
* no matching decryption secret ([b8f3919](https://github.com/Gsync/jobsync/commit/b8f3919cc5fa39d241b034639c73684c3284e34d))
* openssl not found ([290a1a7](https://github.com/Gsync/jobsync/commit/290a1a7b6ba54968ba19ebd0c41a378bbd8b1fa0))
* resume undefined issue ([dbe01a9](https://github.com/Gsync/jobsync/commit/dbe01a91ede0a378dd9678c44ac73823339e4546))
* Revalidate company list in addjob when adding company ([785c49b](https://github.com/Gsync/jobsync/commit/785c49b92ef6459fdb9d77045795108d78d26c65))
* route path ([4234c08](https://github.com/Gsync/jobsync/commit/4234c0808d83871bffb1d2d54a2205a244133771))
* session based conditional rendering ([b008e1b](https://github.com/Gsync/jobsync/commit/b008e1b7efa0912db5512b33561295b4c59b0c4d))

## 1.0.0 (2026-02-28)


### Features

* add release automation ([6fd8247](https://github.com/Gsync/jobsync/commit/6fd8247f836208d61eddae935c4cbd63fac36cde))


### Bug Fixes

* Add job draft date in job details ([f6c2bb6](https://github.com/Gsync/jobsync/commit/f6c2bb65f14364f1292ecccf66c4f2999ba5cfc6))
* Admin tab swich ([8c57052](https://github.com/Gsync/jobsync/commit/8c5705297c643a13c9d00da34a45d7d85f785f23))
* bullet and order styling of editor content ([423b0f4](https://github.com/Gsync/jobsync/commit/423b0f43d0cfff76e1522864bd1b5177773692fb))
* button hydration error ([d7e97a0](https://github.com/Gsync/jobsync/commit/d7e97a014e2d41ccdb1cd77d6baa0b6975576f4b))
* Combobox filter issue ([1ab477e](https://github.com/Gsync/jobsync/commit/1ab477eb6e64f0aab7da360fcc936897217583e5))
* Combobox undefined error ([fdaa9fe](https://github.com/Gsync/jobsync/commit/fdaa9fe72c35695136871a8e92fb5311af52a476))
* configure release-please to target dev branch ([9ca7db0](https://github.com/Gsync/jobsync/commit/9ca7db003a5fb2d0ef4484a223aa7511eb84c08b))
* Create company bug when adding experience ([c992077](https://github.com/Gsync/jobsync/commit/c99207744f8f038ad490d10dba581dba8c13d960))
* DatePicker bug in Safari browser ([0f24106](https://github.com/Gsync/jobsync/commit/0f24106ebe5fabbd65336e2de128a623d3406099))
* Dialog scroll ([93f8e7d](https://github.com/Gsync/jobsync/commit/93f8e7dbec477b14c924ea0f819283c9a1f142f0))
* Edit company ([d7a15e2](https://github.com/Gsync/jobsync/commit/d7a15e293345e8097a43e9e4128b1e5a07ff024b))
* Error accessing ollama api endpoint in docker ([83aa24a](https://github.com/Gsync/jobsync/commit/83aa24a5ec8f503c1f2c758e4fb5ec5d2506bcc4))
* Failing Tasks playwright tests ([4c2cecf](https://github.com/Gsync/jobsync/commit/4c2cecf95c77106b7f6fafd2ded8ca4c16822d9c))
* hydration error, minor refactor ([6d2db31](https://github.com/Gsync/jobsync/commit/6d2db31ebde9ee6afc426f8ece397145becfe731))
* job status undefined issue ([91d3097](https://github.com/Gsync/jobsync/commit/91d309762d87f863ffd481b6c720b91ee8e21c5a))
* jobsApplied based on applied field ([d0ad166](https://github.com/Gsync/jobsync/commit/d0ad166a291477bd53663d59165a40bc6af203cb))
* login error validation ([7df090a](https://github.com/Gsync/jobsync/commit/7df090a6b899b89394d29722f7f247730b2b8713))
* minor layout issues ([55e1e42](https://github.com/Gsync/jobsync/commit/55e1e42d38e26c74ff675f0a761cabe40cde7cb2))
* no matching decryption secret ([b8f3919](https://github.com/Gsync/jobsync/commit/b8f3919cc5fa39d241b034639c73684c3284e34d))
* openssl not found ([290a1a7](https://github.com/Gsync/jobsync/commit/290a1a7b6ba54968ba19ebd0c41a378bbd8b1fa0))
* resume undefined issue ([dbe01a9](https://github.com/Gsync/jobsync/commit/dbe01a91ede0a378dd9678c44ac73823339e4546))
* Revalidate company list in addjob when adding company ([785c49b](https://github.com/Gsync/jobsync/commit/785c49b92ef6459fdb9d77045795108d78d26c65))
* route path ([4234c08](https://github.com/Gsync/jobsync/commit/4234c0808d83871bffb1d2d54a2205a244133771))
* session based conditional rendering ([b008e1b](https://github.com/Gsync/jobsync/commit/b008e1b7efa0912db5512b33561295b4c59b0c4d))
