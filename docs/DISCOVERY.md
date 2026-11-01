# Refractories Photo Bank - Discovery Log

Date: 2026-11-01
Owner: Usman
Working directory: `C:\Users\PC\Projects\refractories`

This file records observed facts only. Secrets, token values, environment variable values, account IDs, and signed URLs are not recorded here.

## Phase 0 - Environment

| Check | Observed result |
|---|---|
| OS | Windows 11 Pro, version 10.0.26300, build 26300, 64-bit |
| Shell | Windows PowerShell 5.1.26100.9711, `powershell.exe` |
| Node.js | `v24.11.0` |
| npm | `11.6.1` via `npm.cmd` |
| npx | `11.6.1` via `npx.cmd` |
| Git | `2.49.0.windows.1` |
| Global Git identity | Not set |
| GitHub CLI | `2.102.0`, authenticated as `ushcodex` |
| Wrangler | Not installed initially. Installed into the npm cache by `npx` during Phase 2 |
| Other package managers | pnpm, yarn, and bun not found |
| Live site | HTTP 200 |
| Cloudflare API root | HTTP 404, host reachable |
| GitHub | HTTP 200 |

## Phase 1 - Local source search

Skipped at the owner's instruction. The owner stated the source is not on the local machine.

No source repository was found or opened.

## Phase 2 - Cloudflare login

- OAuth login succeeded in Chrome.
- One Cloudflare account is visible.
- The owner confirmed the account owns the project.
- The account ID is omitted from this file.
- Wrangler credentials are stored outside the repository in the user's Wrangler config.

## Phase 3 - Cloudflare inventory

### Pages project

- Project name: `refractories-photo-bank`
- Live domain: `refractories-photo-bank.pages.dev`
- Git provider: none
- Deployment method: Direct Upload
- Production branch: `production`
- Build output directory: `public`
- Compatibility date: `2024-09-25`
- Latest deployment date observed: 2026-08-24
- Custom domains: none

### Bindings and environment variable names

Bindings:

- D1 binding: `DB`
- R2 binding: `BUCKET`

Environment variable names only:

- `ADMIN_CODE`
- `MAX_BATCH_SIZE`
- `MAX_FILE_SIZE`
- `MAX_TOTAL_STORAGE_BYTES`

Values were not read, printed, or saved.

### D1

- Database name: `refractories-photos`
- Database ID omitted from this file
- Tables: `photos`, `collections`, `reports`, `_cf_KV`
- Row counts: `photos` 1267, `collections` 26, `reports` 4
- Schema: photos reference collections; reports reference photos

### R2

- Bucket name: `refractories-photos`
- Object count: 2534
- Total object size: 334,543,466 bytes, approximately 319.0 MB
- Object count matches 1267 full photos plus 1267 thumbnails

### Other services

- KV namespaces: none
- Queues: none
- Workers: none
- Cloudflare Access applications: not verified. The OAuth token lacks Access scope and the API returned 403
- `/admin` returns HTTP 200 without an Access challenge

### Live API endpoints observed

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/stats` | Public | Returns photo, collection, contributor, year, and storage totals |
| GET | `/api/years` | Public | Filter options |
| GET | `/api/events` | Public | Filter options |
| GET | `/api/photos` | Public | Supports `page`, `limit`, `year`, `event`, `search` |
| GET | `/api/photos/:id` | Public | 404 for a nonexistent ID |
| GET | `/api/collections` | Public | Returns collection metadata |
| GET | `/api/image/:key` | Public | Serves an R2 object |
| POST | `/api/collections` | Public | Creates an upload collection |
| POST | `/api/upload` | Public | Multipart upload with `full`, `thumb`, `metadata` |
| POST | `/api/reports` | Public | Creates a photo report |
| POST | `/api/admin/verify` | Public endpoint, checks submitted code | GET returns the HTML fallback |
| GET | `/api/reports` | `X-Admin-Code` header | Unauthenticated request returned 403 Unauthorized |
| DELETE | `/api/reports/:id` | `X-Admin-Code` header | Referenced in admin page, not executed |
| DELETE | `/api/photos/:id` | `X-Admin-Code` header | Referenced in admin page, not executed |

GET requests to `/api/upload`, `/api/admin/verify`, and `/api/reports/:id` return the HTML fallback, not API responses.

### Security observations

- The admin page is publicly reachable. The admin API rejects unauthenticated reads of reports with 403.
- The admin code is checked by the server through `POST /api/admin/verify`.
- The browser stores the admin code in `localStorage` after login.
- Public collection metadata includes uploader names, event names, and descriptions.
- Cloudflare Access coverage could not be verified.
- The Pages project is Direct Upload and is not connected to a Git repository.

## Phase 4 - Backups

Backup location outside the repository:

`C:\Users\PC\Projects\refractories-backups\2026-11-01`

| File | Size |
|---|---:|
| `r2-manifest-refractories-photos.json` | 386,571 bytes |
| `r2-manifest-refractories-photos.csv` | 297,777 bytes |
| `d1-refractories-photos.sql` | 583,844 bytes |
| `kv-namespaces.json` | 176 bytes |

Total backup size: 1,268,368 bytes, approximately 1.21 MB.

Verification:

- R2 manifest contains 2534 objects and 334,543,466 total bytes.
- D1 export contains 1267 photo inserts, 26 collection inserts, and 4 report inserts.
- No KV namespaces exist, so the KV export is an empty manifest.
- The D1 export command printed a temporary signed download URL in the terminal. It was not saved, committed, or reused.

The backups contain private project data. They must not be committed to Git.

## Design values read from the live CSS

| Token | Value |
|---|---|
| Background primary | `#07070c` |
| Background secondary | `#0e0e16` |
| Background tertiary | `#14141e` |
| Card background | `rgba(255, 255, 255, 0.025)` |
| Input background | `rgba(255, 255, 255, 0.04)` |
| Text primary | `#f0ebe3` |
| Text secondary | `#7e7a8a` |
| Text tertiary | `#4e4a56` |
| Accent | `#e8a838` |
| Accent hover | `#f0b848` |
| Accent gradient | `#e8a838` to `#d4730d` |
| Success | `#4ade80` |
| Error | `#f87171` |
| Warning | `#fbbf24` |
| Info | `#60a5fa` |
| Heading font | Outfit |
| Body font | Inter |
| Radii | 8, 12, 16, 24, and 9999 px |
| Max content width | 1400 px |
| Navigation height | 64 px |

## Open gaps

- No local source code.
- No Git-connected source in Cloudflare Pages.
- Cloudflare Access coverage not verified.
- Admin page has no Access challenge.
- Source recovery will be required before building the yearbook form.
