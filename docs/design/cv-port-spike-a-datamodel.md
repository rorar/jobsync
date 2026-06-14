# Spike A — CV Data-Model Mapping (cv-manager ↔ JSON Resume ↔ JobSync Prisma)

**Date:** 2026-06-14 · **Context:** ROADMAP 4.2.2 (CV-Manager replacement) · **Goal:** resolve port open-questions Q1 (normalize vs flat) and Q3 (schema-fields vs JSON), and inform versioning (Q-version) + profile auto-fill (4.2.2 step 7).

Ground truth read from: `cv-manager` SQLite schema (`src/server.js`) + `demo-cv-data.json`; JobSync `prisma/schema.prisma` + `src/models/profile.model.ts`; JSON Resume v1 standard.

---

## 1. The three models side by side

### cv-manager (SQLite, presentation-first, flat)
Singleton `profile(id=1)`: name, initials, title, subtitle, bio, location, linkedin, email, phone, languages (free string), visible, **profile_picture** (filename/crop/propagate), open_to_work.
- `experiences`: job_title, company_name, start_date (`YYYY-MM` TEXT), end_date, location, country_code, **highlights[]** (JSON), sort_order, **visible**
- `certifications`: name, provider, issue_date, expiry_date, credential_id, sort_order, visible
- `education`: degree_title, institution_name, start_date (`YYYY`), end_date, description, sort_order, visible
- `skill_categories` (name, **icon**, visible) → `skills` (category_id FK, name) — nested
- `projects`: title, description, **technologies[]** (JSON), link, visible
- `custom_sections` (name, section_key, **layout_type** `grid-3`, icon) → `custom_section_items` (title, subtitle, description, link, icon, image, **metadata** JSON, visible)
- `section_visibility` (per-section toggle), `section_title_overrides` (per-language display name)
- **`saved_datasets`** = versioning: `data` = **full-CV JSON blob**, `slug`, `language`, `language_group`, `version_group`, `version`, `is_public`, `is_default`; UNIQUE(slug,version,language)

### JSON Resume v1 (intermediate standard)
`basics{name,label,image,email,phone,url,summary,location{},profiles[]}`, `work[{name,position,startDate,endDate,summary,highlights[]}]`, `education[{institution,area,studyType,startDate,endDate,courses[]}]`, `skills[{name,level,keywords[]}]`, `projects[{name,description,highlights[],keywords[],url}]`, `certificates[{name,date,issuer,url}]`, `awards/publications/languages/interests/references/volunteer`.

### JobSync (Prisma, entity-normalized, DDD)
`Profile(userId, addressCountryCode, addressSubdivisionCode, preferredCurrency)` — **NO name/email/phone** → `Resume(title) → ContactInfo?(firstName,lastName,headline,email,phone,address)` (1:1, per-resume) + `ResumeSection(sectionType) → {Summary(content) | WorkExperience[] | Education[] | LicenseOrCertification[] | OtherSection[]}`.
- `WorkExperience`: **companyId→Company, jobTitleId→JobTitle, locationId→Location** (3 FK entities, shared with Job aggregate), startDate `DateTime`, endDate, **description (single string)**
- `Education`: institution, degree, fieldOfStudy, locationId→Location, startDate `DateTime`, description
- `LicenseOrCertification`: title, organization, issueDate, expirationDate, credentialUrl
- `OtherSection`: **title, content (string only — NO jsonData)**
- `SectionType` enum: summary, experience, education, license, certification, course, project, other (note: `project` type exists but **no Project model**)

---

## 2. Field mapping + gap analysis

| Concept | cv-manager | JSON Resume | JobSync Prisma | Gap |
|---|---|---|---|---|
| Identity | `profile` singleton | `basics` | **ContactInfo (per-Resume)** | ⚠️ No central identity; scattered per resume |
| Experience | company_name + location (free text) | work.name | **Company/JobTitle/Location FKs** | ⚠️ Normalized vs free-text |
| Exp. bullets | **highlights[]** | work.highlights[] | **description (1 string)** | ❌ JobSync loses bullet structure |
| Date format | `YYYY-MM` / `YYYY` string | ISO string | **DateTime** | ⚠️ Year-only/month-only needs string or nullable-day |
| Skills | skill_categories+skills (**icon**, nested) | skills[keywords] | **none** | ❌ No skills model (4.1 roadmap) |
| Projects | projects (**technologies[]**, link) | projects[] | **none** (enum only) | ❌ No Project model |
| Certifications | certifications | certificates | LicenseOrCertification | ✅ close |
| Custom sections | custom_sections + items (layout, rich) | — | **OtherSection (title+content)** | ❌ No rich/JSON custom data |
| Per-item visibility | **visible** everywhere | — | **none** | ❌ No visibility |
| Section visibility | section_visibility | — | **none** | ❌ |
| Versioning | **saved_datasets (full JSON snapshot)** | — | **none** | ❌ No versioning |
| Public/slug | is_public + slug | — | **none** | ❌ (→ shared-surface 2.18.2) |
| Picture | profile_picture | basics.image | LogoAsset (companies only) | ❌ No CV photo |
| Languages | languages (free str) | languages[] | **none** | ❌ |

**Verdict:** JobSync's current (Gsync-upstream) Resume schema is **missing ~half the cv-manager model** (skills, projects, visibility, versioning, highlights[], rich custom sections, central identity, photo, languages) AND is **more rigid** where it does overlap (entity FKs, single-string description, DateTime). It was built as a structured-form tracker, not a presentation-first CV builder.

---

## 3. Two decisive findings

**F1 — Versioning is a deep-copy JSON snapshot.** cv-manager's `saved_datasets.data` stores the **entire CV as a JSON blob**; live tables are the working copy, snapshots are full denormalized copies (`version_group` chains versions, `language_group` chains translations, `slug` for public URL). This **sidesteps the "shared mutable entity" snapshot problem** entirely — a version is self-contained, immune to later Company/Location edits. Proven, simple. → adopt for JobSync versioning.

**F2 — JobSync has no canonical identity store.** Personal data (name/email/phone) lives in `ContactInfo` **per Resume**, not centrally; `Profile` holds only location/currency prefs. cv-manager has a singleton `profile`. → the "auto-fill personal data from profile, override per CV" requirement (4.2.2 step 7) needs a **canonical identity source first** (extend `Profile` with identity fields, or designate a default ContactInfo). Without it, "auto-fill from profile" has no source.

---

## 4. Recommendation (answers Q1 + Q3)

**Adopt JSON Resume as the canonical CV-document model; keep entity links as optional enrichment; version via JSON snapshot.**

1. **Core = JSON Resume document** (already the 4.2 plan; maps 1:1 to cv-manager). The working CV is structured data conforming to JSON Resume (+ `x-jobsync-*` extensions for `visible`, icon, layout, custom sections). This is the **flat/document** answer to Q1 — the normalized Gsync schema is the wrong foundation for a presentation CV builder.
2. **Entity links = optional, non-core (Q1 nuance).** A CV experience carries **denormalized** `company_name`/`location`/`highlights[]` (self-contained, JSON-Resume-shaped), PLUS an **optional nullable `companyId`/`locationId`** to link to a known entity — for "which CV applied to which company" + dedup + enrichment. Entity link is a *post-hoc annotation*, not the storage model. Preserves the DDD value (Job↔CV traceability) without forcing normalization on the document.
3. **Versioning = `CvDocument` snapshot (Q-version, F1).** New Prisma model: `CvDocument { id, profileId/userId, data Json, versionGroup, languageGroup, slug?, isPublic, isDefault, createdAt }` — full denormalized JSON snapshot per version/language. `data` is the JSON Resume document.
4. **Schema vs JSON (Q3): JSON for the document, real columns only for index/query keys.** The CV content lives in `CvDocument.data` (Json) — skills/projects/visibility/custom-sections/highlights all fit naturally, no schema churn per field. Promote to real columns ONLY what must be queried/indexed (slug, isPublic, versionGroup, userId). This avoids 6+ new normalized tables and matches cv-manager's proven blob approach.
5. **Identity (F2):** extend `Profile` with canonical identity (name, email, phone, headline, photo, languages) as the **auto-fill source**; each `CvDocument` snapshots it into `data.basics` with per-CV override (4.2.2 step 7) — override lives in the document, never mutates `Profile`.
6. **Strangler Fig:** keep the Gsync `Resume/ResumeSection/*` tables for backward-compat + migration import; the new builder operates on `CvDocument`. An adapter imports legacy Resume → JSON Resume on first edit. AI match/review (PII-stripped, `src/lib/pii`) runs on `CvDocument.data`.

**Net:** lean **document-first (JSON Resume) with optional entity annotations + JSON-snapshot versioning** — NOT the normalized current schema, NOT a naive flat dump that loses Job-traceability.

---

## 5. Resolved / still-open

- ✅ **Q1 (normalize vs flat):** document-first JSON Resume core + optional entity links (hybrid leaning flat).
- ✅ **Q3 (schema vs JSON):** JSON document (`CvDocument.data`); real columns only for query keys.
- ✅ **Q-version (snapshot):** deep-copy JSON snapshot (`CvDocument`), per version/language group (F1).
- ✅ **Auto-fill source (F2):** extend `Profile` with canonical identity.
- ⏭ **Open:** exact `x-jobsync-*` extension schema for visible/icon/layout/custom-sections; legacy-import adapter detail; diff granularity (document vs section); skills/projects also surfaced to 4.1 Skillsets?
- ⏭ **Next:** Spike B (pdfme template fidelity) operates on this `CvDocument` JSON.
