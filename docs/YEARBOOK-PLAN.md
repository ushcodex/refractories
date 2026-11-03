# Yearbook Plan

Date: 2026-11-01

This file records the approved design decisions. It contains no secrets and no roster PII.

## Site

- New site name: `u19ce.pages.dev`
- The name applies to the entire site, not only the yearbook form.
- The existing `refractories-photo-bank.pages.dev` production site stays untouched until the new site is tested and approved.

## Entry gate

- The entire site is behind a fun question.
- Question: `Corona, Covid, ASUU, PTP, Chemistry, tested by heat, tested by time, tested by pressure? Who are we?`
- Expected answer: `refractories`
- Validation: case-insensitive, whitespace-trimmed similarity of at least 70 percent.
- Validation happens on the server. The answer is never shipped to the browser.
- A correct answer issues a signed HttpOnly session cookie.
- Attempts are rate-limited.
- No CAPTCHA is used.

## Roster and validation

- Active roster: 109 names.
- Prefixes: `U19CE` 72, `U19PL` 21, `U21CE` 16.
- Removed: `U18CE` 12, `U18PT` 1, `U19PT` 10, `U21PT` 1.
- The original 133-name list is preserved in the secure private folder.
- The active roster is stored only in the secure private folder.
- The public name dropdown exposes a roster ID and display name, never a registration number.
- The server stores only a keyed hash of each registration number.
- To upload a photo or submit the form, the user selects their name and enters their registration number. The server validates the pair.
- The real roster and registration numbers are never committed to the public repository.

## Academic data

- Class label: `Class of 2024`.
- Academic staff: 35 names, exact spellings preserved.
- Courses: 82 courses across 10 semesters.
- `ENGG 299 - SWEP` is in Year Two Second Semester.
- `CHEN 498 - SIWES` is in Year Four Second Semester.

## Form

- Mobile-first, multi-step.
- Roster-based name selection.
- Registration number validation.
- Draft autosave.
- Live preview.
- Edit token.
- Photo upload for portrait, candid, and optional department photo.
- Moderation queue.
- Server validation.
- XSS protection.
- Privacy controls.
- Submission deadline: Tuesday, 3 November 2026, 11:59 PM WAT.
- The form does not auto-lock. The admin locks and unlocks it.

## Superlatives

- The superlative page is behind an off-by-default feature flag.
- The admin opens and closes it.
- There are 16 fun superlatives:
  1. Most Likely to Become a Professor
  2. Most Likely to Win a Nobel Prize
  3. Most Likely to Build a Refinery
  4. Most Likely to Win a Scholarship
  5. Most Likely to Go Viral
  6. Most Likely to Remember Everyone's Birthday
  7. Most Likely to Plan the Reunion
  8. Most Likely to Survive on Indomie
  9. Most Likely to Ask "Is This Going to Be in the Exam?"
  10. Most Likely to Have the Best Notes
  11. Most Likely to Stay Calm in a Crisis
  12. Most Likely to Be the Group Chat Admin
  13. Most Likely to Travel the World
  14. Most Likely to Become a Philanthropist
  15. Most Likely to Write a Book
  16. Most Likely to Lead a Major Project
- Excluded existing awards: Most Innovative, Most Beautiful, Most Handsome, Most Punctual, Most Social, Best Dressed, Best Entrepreneur, Class Comedian, Most Reserved, Most Friendly.
- Disclaimer: these superlatives are not class awards, they are just for fun, there are no strings attached, everyone is encouraged to participate, and there is no award, visibility, or prize.
- No comments section, live commentary, or side commentary.
- No commentary about admin controls or technical behaviour on the public site.
- One ballot per roster person.
- No self-votes.
- Vote counts stay hidden until the admin publishes results.

## Admin

- Shared admin password, already used by the existing site.
- Verified on the server, not only in the browser.
- Rate-limited.
- Admin controls: moderation, lock and unlock the form, open and close superlatives, publish results, reissue edit links, export data.

## Storage

- Production D1: new database `refractories-yearbook`.
- Preview D1: `refractories-yearbook-preview`.
- Production R2: existing `refractories-photos` bucket with prefix `yearbook/`.
- Preview R2: `refractories-yearbook-preview`.
- Production Pages: new project `u19ce`.
- Preview deployment: preview branch of `u19ce`, no production alias, no DNS change.
- Photos use server-generated keys:
  - `yearbook/portraits/<profile-id>/<random>`
  - `yearbook/candid/<profile-id>/<random>`
  - `yearbook/department/<profile-id>/<random>`

## Open setup items

- Admin password for the preview environment.
- Roster pepper for registration-number hashing.
- Final approval before creating preview resources.
