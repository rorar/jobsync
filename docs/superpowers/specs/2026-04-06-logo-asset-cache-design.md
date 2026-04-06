# Logo Asset Cache — Design Specification

**Date:** 2026-04-06
**Status:** Approved (rev 2 — post-architect-review)
**Scope:** Download, store, serve, and manage company logo images as local assets.
**Allium Spec:** `specs/logo-asset-cache.allium`

## Problem

Company logos are currently served directly from external URLs (Clearbit, Google Favicon, Wikimedia). This causes:
- External requests on every page load per logo
- Dependency on third-party availability
- No control over image sizing/quality
- Broken images when external services block hotlinking
- No local asset for future features (folder icons, File Explorer)

## Solution

Download logo images locally on enrichment, store them on the persistent Docker volume alongside the database, and serve them from the local filesystem. The enrichment pipeline remains unchanged — it still discovers URLs. This feature is a **post-enrichment consumer** that downloads and manages the actual image bytes.

## Architecture

```
EnrichmentCompleted event (carries domainKey, not companyId)
        │
        ▼
  LogoAssetSubscriber (src/lib/assets/)
        │
        ├─ Resolve companyId from domainKey + userId
        ├─ SSRF-validate sourceUrl (validateWebhookUrl)
        ├─ Download image (redirect: "manual", abort at 1MB body limit)
        ├─ Validate content-type + magic bytes
        ├─ SVG: sanitize (strip scripts, event handlers, external refs)
        ├─ Raster: resize to bounding box (preserving aspect ratio)
        ├─ Store on disk: /data/logos/{userId}/{companyId}/logo.{ext}
        ├─ Create/update LogoAsset record in DB
        └─ Set Company.logoAssetId

  CompanyLogo component
        │
        ├─ LogoAsset exists + ready? → serve from /api/logos/{id}
        ├─ Company.logoUrl exists?   → serve from external URL (fallback)
        └─ Neither?                  → show initials
```

**Location:** `src/lib/assets/` — new domain area. Not inside data-enrichment (different concern: asset management, not discovery). File Explorer will later live alongside it. Follow `globalThis` singleton pattern for the LogoAssetSubscriber service.

**Storage:** `/data/logos/{userId}/{companyId}/logo.{ext}` — directory-per-company layout for EP-1 compatibility (derived formats like `folder.ico` will sit alongside the master asset). Same Docker volume as `dev.db` (`./jobsyncdb/data:/data`), survives rebuilds.

**Server Actions:** `src/actions/logoAsset.actions.ts` — repository for the LogoAsset aggregate (following existing action file pattern).

## Entities

### LogoAsset (new Prisma model)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | String | Owner (IDOR protection) |
| companyId | String | Linked Company (@@unique with userId) |
| sourceUrl | String | External URL that was downloaded |
| filePath | String | Local disk path (server-constructed, never from user input) |
| mimeType | String | image/png, image/svg+xml, etc. |
| fileSize | Int | Bytes after processing |
| width | Int? | Pixels after resize (null for SVG) |
| height | Int? | Pixels after resize (null for SVG) |
| status | String | pending, ready, failed |
| errorMessage | String? | Error detail when failed (null on success, aids debugging) |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### LogoAssetConfig (in UserSettings JSON)

| Setting | Default | Description |
|---------|---------|-------------|
| maxFileSize | 524288 (512KB) | Max file size in bytes after processing |
| maxDimension | 512 | Bounding box in pixels (neither width nor height exceeds this) |

### Company model change

Add optional `logoAssetId: String?` with relation to LogoAsset. Existing `logoUrl` remains as external URL fallback.

## Rules

### 1. DownloadOnEnrichment
When `EnrichmentCompleted` fires for dimension `logo`:
- Resolve `companyId` from `domainKey` + `userId` (event does not carry companyId directly)
- Check for existing LogoAsset — skip if same URL + status `ready`, or if status `pending` (concurrent download guard)
- Create LogoAsset with status `pending`
- SSRF-validate the URL via `validateWebhookUrl()` (blocks private IPs, IMDS, localhost)
- Download with `redirect: "manual"` — follow redirects only if Location also passes SSRF validation (max 3 hops)
- Stream body with abort at `MAX_DOWNLOAD_BYTES` (1MB) to prevent memory exhaustion
- Validate: Content-Type must be in ACCEPTED_MIME_TYPES
- Magic byte validation: first bytes must match declared MIME type
- SVGs: sanitize (strip `<script>`, event handlers, `javascript:` URIs, `xlink:href` external refs, `<foreignObject>`)
- Raster: resize to fit bounding box (aspect ratio preserved)
- Compress if fileSize exceeds maxFileSize after resize
- Store on disk, update LogoAsset to `ready`
- Set Company.logoAssetId
- On failure: set LogoAsset status to `failed` with `errorMessage`. Company falls back to logoUrl.

### 2. ReDownloadOnChange
When `EnrichmentCompleted` fires and the new logoUrl differs from existing `LogoAsset.sourceUrl`:
- Delete old file from disk
- Re-download from new URL (same validation pipeline)
- Update LogoAsset record (sourceUrl, filePath, metadata)

### 3. ManualUrlSync
When user saves a company with a changed logoUrl in AddCompany:
- Trigger the same download-and-store flow
- Works for manually entered URLs, Wikipedia-resolved URLs, etc.
- Same SSRF validation applies to user-supplied URLs

### 4. DeletionFromUI
User can delete a LogoAsset from the company edit dialog:
- Remove file from disk (and company directory if empty)
- Delete LogoAsset DB record
- Clear Company.logoAssetId
- UI falls back to Company.logoUrl or initials

### 5. CleanupOnCompanyDeletion
When a Company is deleted:
- Delete LogoAsset file from disk (and company directory)
- Delete LogoAsset DB record (Prisma cascade or explicit cleanup)
- Prevents orphaned files on the volume

### 6. BoundingBoxResize
- Source images exceeding maxDimension are downscaled to fit within maxDimension x maxDimension
- Aspect ratio preserved — wide banner logos stay wide, tall logos stay tall
- SVGs: sanitized and stored as-is (vector graphics, infinite scaling, width/height = null)
- If file size still exceeds maxFileSize after resize, increase JPEG/WebP compression
- PNG logos with transparency preserved (no JPEG conversion)

### 7. ServingPriority
UI rendering order in CompanyLogo component:
1. Company.logoAssetId → LogoAsset.status === ready → serve local
2. Company.logoUrl → serve external (fallback)
3. Neither → show initials avatar

## Extension Points (future — not built in this phase)

### EP-1: Folder Icon Generation
Derive OS-specific folder icons from LogoAsset:
- `.ico` (Windows network folders, 16/32/48/256px multi-size)
- `.icns` (macOS)
- `desktop.ini` / `Icon\r` generation for network-mounted folders
- Triggered: on LogoAsset ready, generates derived formats alongside master
- Storage: `/data/logos/{userId}/{companyId}/folder.ico`, `folder.icns` (directory-per-company layout)

### EP-2: File Explorer Integration
LogoAsset appears as a browsable asset in the File Explorer UI:
- Company folders show their logo as the folder icon
- LogoAsset metadata (dimensions, size, source) visible in file details
- Requires: File Explorer ROADMAP item to be implemented first

### EP-3: Wikipedia Logo Discovery Module
Enrichment module that discovers logos from Wikimedia Commons by company domain:
- Input: company domain (e.g., "niederegger.de")
- Searches Wikipedia API for the company page
- Extracts logo file from infobox/Wikidata
- Returns direct upload.wikimedia.org URL
- Slots into fallback chain: Clearbit → Google Favicon → **Wikipedia** → Placeholder
- Separate from URL normalization in logoCheck.actions.ts (that handles user-pasted Wikipedia media page URLs)
- Note: Wikimedia API has strict user-agent requirements and rate limits

## Security Considerations

- **IDOR:** All LogoAsset queries include userId (ADR-015)
- **SSRF:** Download URL validated via `validateWebhookUrl()` before fetch — blocks private IPs, IMDS, localhost, non-http(s). Applies to both enrichment-sourced and user-supplied URLs.
- **Open redirect SSRF:** `redirect: "manual"` on fetch. Follow redirects only if Location passes SSRF validation. Max 3 hops.
- **SVG XSS:** SVGs sanitized before storage (strip `<script>`, event handlers, `javascript:` URIs, external refs, `<foreignObject>`). Served with `Content-Security-Policy: sandbox` as defense-in-depth.
- **MIME spoofing:** Magic byte validation after download — file header must match declared Content-Type.
- **File path traversal:** filePath constructed server-side from userId + companyId (UUIDs, no traversal chars), never from user input.
- **Download size limit:** Streaming body read aborted at `MAX_DOWNLOAD_BYTES` (1MB) before processing. Prevents memory exhaustion from oversized responses.
- **Content-type validation:** Only `ACCEPTED_MIME_TYPES` downloaded. Others rejected before reading body.

## Serving Strategy

API route `/api/logos/[id]` serves the local file with:
- Auth check (must be logo owner, userId in query)
- `Cache-Control: public, max-age=86400, immutable`
- Correct `Content-Type` from LogoAsset.mimeType
- SVGs: `Content-Security-Policy: sandbox` header (defense-in-depth)
- `Content-Disposition: inline`
