# Logo Asset Cache — Design Specification

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Download, store, serve, and manage company logo images as local assets.

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
EnrichmentCompleted event
        │
        ▼
  LogoAssetSubscriber (src/lib/assets/)
        │
        ├─ Download image from sourceUrl
        ├─ Validate content-type (image/*)
        ├─ Resize to fit bounding box (preserving aspect ratio)
        ├─ Store on disk: /data/logos/{userId}/{companyId}.{ext}
        ├─ Create/update LogoAsset record in DB
        └─ Set Company.logoAssetId

  CompanyLogo component
        │
        ├─ LogoAsset exists + ready? → serve from /api/logos/{id}
        ├─ Company.logoUrl exists?   → serve from external URL (fallback)
        └─ Neither?                  → show initials
```

**Location:** `src/lib/assets/` — new domain area. Not inside data-enrichment (different concern: asset management, not discovery). File Explorer will later live alongside it.

**Storage:** `/data/logos/{userId}/{companyId}.{ext}` — same Docker volume as `dev.db` (`./jobsyncdb/data:/data`), survives rebuilds.

## Entities

### LogoAsset (new Prisma model)

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | String | Owner (IDOR protection) |
| companyId | String | Linked Company (@@unique with userId) |
| sourceUrl | String | External URL that was downloaded |
| filePath | String | Local disk path |
| mimeType | String | image/png, image/svg+xml, etc. |
| fileSize | Int | Bytes after processing |
| width | Int? | Pixels after resize (null for SVG) |
| height | Int? | Pixels after resize (null for SVG) |
| status | String | pending, ready, failed |
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
- Create LogoAsset with status `pending`
- Download image from the enriched URL
- Validate: response must have image/* content-type
- Resize raster images to fit within bounding box (aspect ratio preserved)
- SVGs stored as-is (vector, no resize)
- Compress if fileSize exceeds maxFileSize after resize
- Store on disk, update LogoAsset to `ready`
- Set Company.logoAssetId
- On failure: set LogoAsset status to `failed`, log error. Company falls back to logoUrl.

### 2. ReDownloadOnChange
When `EnrichmentCompleted` fires and the new logoUrl differs from existing `LogoAsset.sourceUrl`:
- Delete old file from disk
- Re-download from new URL
- Update LogoAsset record (sourceUrl, filePath, metadata)

### 3. ManualUploadSync
When user saves a company with a changed logoUrl in AddCompany:
- Trigger the same download-and-store flow
- Works for manually entered URLs, Wikipedia-resolved URLs, etc.

### 4. DeletionFromUI
User can delete a LogoAsset from the company edit dialog:
- Remove file from disk
- Delete LogoAsset DB record
- Clear Company.logoAssetId
- UI falls back to Company.logoUrl or initials

### 5. BoundingBoxResize
- Source images exceeding maxDimension are downscaled to fit within maxDimension x maxDimension
- Aspect ratio preserved — wide banner logos stay wide, tall logos stay tall
- SVGs stored as-is (vector graphics, infinite scaling)
- If file size still exceeds maxFileSize after resize, increase JPEG/WebP compression
- PNG logos with transparency preserved (no JPEG conversion)

### 6. ServingPriority
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
- Storage: `/data/logos/{userId}/{companyId}/folder.ico`, `folder.icns`

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

## Security Considerations

- **IDOR:** All LogoAsset queries include userId (ADR-015)
- **SSRF:** Download URL validated before fetch (same pattern as enrichment modules)
- **File path traversal:** filePath constructed server-side from userId + companyId, never from user input
- **Content-type validation:** Only image/* MIME types accepted
- **Size limits:** Enforced before writing to disk (reject oversized downloads early via streaming)

## Serving Strategy

API route `/api/logos/[id]` serves the local file with:
- Auth check (must be logo owner)
- `Cache-Control: public, max-age=86400, immutable` (logos change via re-download, not URL change)
- Correct `Content-Type` from LogoAsset.mimeType
- `Content-Disposition: inline`
