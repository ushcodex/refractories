# Source Recovery Record

Date: 2026-11-01

This document records what was recovered from the live site and what was reconstructed. No production resource was changed.

## Recovered static front end

Downloaded from `https://refractories-photo-bank.pages.dev/` and saved under `public/`:

| Live path | Local path |
|---|---|
| `/` | `public/index.html` |
| `/upload` | `public/upload.html` |
| `/about` | `public/about.html` |
| `/admin` | `public/admin.html` |
| `/css/styles.css` | `public/css/styles.css` |
| `/js/config.js` | `public/js/config.js` |
| `/js/utils.js` | `public/js/utils.js` |
| `/js/compression.js` | `public/js/compression.js` |
| `/js/upload.js` | `public/js/upload.js` |
| `/js/gallery.js` | `public/js/gallery.js` |
| `/js/lightbox.js` | `public/js/lightbox.js` |
| `/manifest.json` | `public/manifest.json` |

The live site uses no local image or font files. It uses Google Fonts and data-URI icons. No images or fonts were recovered because none are served by the project.

## Reconstructed Pages Functions

| Method | Path | Local file |
|---|---|---|
| GET | `/api/stats` | `functions/api/stats.js` |
| GET | `/api/years` | `functions/api/years.js` |
| GET | `/api/events` | `functions/api/events.js` |
| GET | `/api/photos` | `functions/api/photos/index.js` |
| GET | `/api/photos/:id` | `functions/api/photos/[id].js` |
| DELETE | `/api/photos/:id` | `functions/api/photos/[id].js` |
| GET | `/api/collections` | `functions/api/collections/index.js` |
| POST | `/api/collections` | `functions/api/collections/index.js` |
| GET | `/api/image/:key` | `functions/api/image/[[path]].js` |
| POST | `/api/upload` | `functions/api/upload.js` |
| GET | `/api/reports` | `functions/api/reports/index.js` |
| POST | `/api/reports` | `functions/api/reports/index.js` |
| DELETE | `/api/reports/:id` | `functions/api/reports/[id].js` |
| POST | `/api/admin/verify` | `functions/api/admin/verify.js` |

## Observed behaviour

- The public JSON field names and response envelopes were compared against production for stats, years, events, photos, single photos, and collections.
- All eight compared response shapes matched production.
- `/api/photos` caps `limit` at 100.
- `/api/photos/:id` returns `Photo not found` with 404 for a missing photo.
- `/api/image/:key` returns the R2 object with `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`.
- `/api/reports` returns 403 `Unauthorized` without the `X-Admin-Code` header.
- Clean URL redirects match production: `.html` paths return 308 to the extensionless path.

## Inferred behaviour and deliberate safety changes

These items could not be observed directly without writing production data or using the admin code. They are reconstructed from the front-end code and the database schema.

- The `/api/reports` response field names were inferred from `public/admin.html`.
- The POST response shapes for collections, uploads, reports, and admin verification were inferred from the front-end code.
- The upload endpoint generates R2 keys on the server from the year, collection ID, and photo ID. It does not trust client-supplied keys. The key pattern matches the live objects.
- The image endpoint only serves keys beginning with `photos/` or `thumbs/`.
- The upload endpoint verifies image type by file signature, not by the browser-supplied MIME type.
- The upload endpoint enforces `MAX_FILE_SIZE`, a 150 KB thumbnail limit, `MAX_BATCH_SIZE`, and `MAX_TOTAL_STORAGE_BYTES`.
- The admin code comparison uses a constant-time comparison.
- The reconstructed code has no rate limiting. The live site did not show evidence of rate limiting.
- Default limits used for local testing: 512000 bytes per full image, 150000 bytes per thumbnail, 200 photos per collection, and 8 GB total storage.

## Local smoke tests

The reconstructed app ran locally with `wrangler pages dev public` on port 8788, a local D1 database, and a local R2 bucket.

| Test | Result |
|---|---|
| Public response shape comparison against production | 8 of 8 passed |
| Valid upload with JPEG and thumbnail | Passed |
| Image retrieval after upload | Passed, `image/jpeg` and immutable cache header |
| Wrong file type | 400 |
| Oversize full image | 400 |
| Duplicate collection ID | 400 |
| Admin verification with correct code | `authorized: true` |
| Admin verification with wrong code | `authorized: false` |
| Reports without admin header | 403 |
| Reports with admin header | 200 |
| Delete report without admin header | 403 |
| Delete report with admin header | 200 |
| Delete photo without admin header | 403 |
| Delete photo with admin header | 200 |
| Image after photo deletion | 404 |
| Clean URL redirects | Match production |

## Production impact

None. No production deployment, R2 object, D1 row, or Pages setting was changed.
