## 2026-10-21 — pro sweep of the site, wiki, sign-in and admin: measured in Chromium, eleven fixes

- Agent #28 of `docs/ai/cloud-briefs/2026-10-13-pro-sweep.md`, on `origin/dev`. Audit:
  `docs/ai/audits/2026-10-21-site-wiki-admin.md`; rerunnable walk: `scripts/audit/site-wiki-admin.cjs`
  (axe-core WCAG 2.2 AA via `@axe-core/playwright` 4.13.0, pinned; Tab ring check; target sizes; real
  wheel scroll with deltaX, wheel-dead area and a ctrlKey pinch; 7 pages × 4 device rows; one browser
  context per row so serverXR's 60-guest-sessions-per-10-minutes cap is not hit; exits 1 on any axe
  violation).
- Ran in a cloud container against a real dev stack (serverXR on a throwaway data dir, one seeded
  space). Same script, before → after: axe violations in this area's files went from `label` critical
  (admin, 4 rows) + `nested-interactive` serious ×4 (admin, 4 rows) + `color-contrast` on the wiki's
  "Updated" line (2 rows) to 0; Tab stops with no ring went from 2 of 3 to 0 of 3 on `/login` and from
  1 of 40 to 0 of 40 on `/wiki`. A real wheel over the landing's room moved the page 0 px (66 % of
  the first screen, the background canvas in a fixed layer); after, 360 px and 0 % dead.
- Fixed, one commit and one red-then-green vitest each: the sign-in fields' focus ring, a refused
  sign-in announced (`role=alert`), 16 px sign-in fields (no phone zoom), admin rename/link fields
  named, one control per admin Directory row (a keyboard can close a space), a failed OAuth return
  stays until dismissed, the toast's Dismiss at 24/44 px, the wiki's "Updated" line at AA, the wiki
  search's focus ring, and a wheel or touchpad scroll over the room behind the landing and the
  wiki scrolls the page. Each has a row in `docs/ai/known-fixes.md`.
- Still open, with a size each in the audit: the wiki puts its first article 3,998 px down on a phone,
  behind 118 contents links (sev 3, M); the sign-in page has no `h1`; MUI card buttons show focus only
  as a ripple; one address wears five names on the landing; touch targets under 44 px on sign-in and
  the wiki contents; findings in files owned elsewhere (`src/styles/preferences.css` focus and contrast,
  the tier chip, `wikiContent.js` in open PRs).
- Not done: nobody looked on a real phone, a real touchpad or Safari, and no screen reader was
  listened to. The owner's look on phone, touchpad and desktop is owed.
