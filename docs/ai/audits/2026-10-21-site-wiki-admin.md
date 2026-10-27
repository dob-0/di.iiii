# Audit — site, landing, wiki, sign-in, admin and spaces lists (2026-10-21)

**Seen in a browser, not by a person.** Every MEASURED row below was taken in headless Chromium
(Playwright 1.64, the image's `/opt/pw-browsers/chromium`) against a dev stack: Vite on `:5173`,
serverXR on a throwaway data dir (`DATA_ROOT` in `/tmp`, `API_TOKEN` set) with one seeded space
(`audit-space`) plus the boot-ensured ones. All seven pages mounted on every row of the runs quoted
here. Nobody looked at a
real phone, a real touchpad or Safari: the owner's look on phone, touchpad and desktop is still
owed, and every row says which of its claims rest on Chromium alone.

Brief: agent #28 of `docs/ai/cloud-briefs/2026-10-13-pro-sweep.md` (owner's N612 ask, 2026-10-13: *"find
what is not professional, fix all of it"*), run on `origin/dev` of 2026-10-20.

## Method

1. **Heuristics**: Nielsen's 10 usability heuristics (NN/g), severity 0–4 on Nielsen's scale
   (0 not a problem · 1 cosmetic · 2 minor · 3 major · 4 catastrophe). Cited as H1–H10.
2. **Accessibility**: WCAG 2.2 AA with axe-core 4.13 (`@axe-core/playwright` 4.13.0, tags
   `wcag2a wcag2aa wcag21a wcag21aa wcag22aa`), plus what axe cannot judge: Tab reach and a visible
   ring on every stop (2.1.1, 2.4.7, 2.4.11), target size (2.5.8: 24 px; 44 px on the touch rows,
   the brief's bar), status messages (4.1.3), contrast (1.4.3) by arithmetic.
3. **Device matrix** (`scripts/audit/site-wiki-admin.cjs`): mouse + keyboard 1440×900 at DPR 1 and 2 ·
   touchpad on both desktop rows (two-finger scroll = real wheel input with deltaX ≠ 0; pinch = a
   ctrlKey wheel, read for whether a listener swallows the browser's zoom) · phone
   `devices['iPhone 13']` (390×844, DPR 3, touch) · tablet 820×1180 touch · keyboard only (the Tab walk
   on the desktop rows). Pages: `/`, `/wiki`, `/spaces`, `/login`, a closed door (`/no-such-space-here`),
   `/device`, `/admin` → Manage with a space open and Rename pressed. Plus probes for what the walk
   found: the focused field's computed style, the toast's timing and size, the canvas's ancestors.
4. **Lint**: eslint-plugin-jsx-a11y 6.10.2 over the area's `.jsx`, counted as unique file:line.
5. **Code reading** of the area for what neither tool reaches (announcements, timers, copy).
6. Fix order: severity 4, 3, then 2 where S-sized, one commit and one red-then-green vitest each.

Rerun: `npm run dev` (or `di-dev up <tree>`), then
`node scripts/audit/site-wiki-admin.cjs http://localhost:5173 --token <API_TOKEN>`; it writes a
screenshot per page × row and `report.txt` to `.verify-surfaces/site-wiki-admin/` and exits 1 on
any axe violation.

## Numbers, before → after

Same final script, same stack, back to back: "before" ran on dev's versions of the six fixed files
(`git checkout origin/dev -- <files>`, Vite reloading them), "after" on this branch. No 429 in either.

| measure | before | after |
|---|---|---|
| axe violations in this area's files | `label` critical (admin, 4 of 4 rows) · `nested-interactive` serious ×4 nodes (admin, 4 of 4 rows) · `color-contrast` serious on `.wiki-article-updated` (wiki, 2–3 rows per run) | **0** |
| axe violation groups, all 7 pages × 4 rows (includes files owned elsewhere: X2–X4, X8) | 22 | 12 (8 on `/spaces`, 4 on admin chrome and the tier chip) |
| Tab stops with no ring: `/login` · closed door · `/device` · `/wiki` · `/admin` | 2 of 3 · 2 of 6 · 2 of 6 · 1 of 40 · 4 of 9 | 0 of 3 · 0 of 6 (3 show only MUI's ripple, G3) · 0 of 6 · 0 of 40 · 4 of 9 (X2, `preferences.css`) |
| a real wheel at (400, 400), 6 steps of (12, 60) px: landing @1x · @2x | 43 px · 0 px | 360 px · 360 px |
| wheel-dead area at 1440×900: landing · wiki | 66 % · 25 % | 0 % · 0 % |
| admin targets under 24 px, desktop | 5 | 1 (not in this file: X6) |
| jsx-a11y warnings, repo config (recommended + 4 rules at warn) | 0 | 0 |
| jsx-a11y warnings, the plugin's `strict` set, unique file:line | 8 | 3 (`AuthGate.jsx:592` autofocus, kept on purpose and disabled inline; `DeviceLoginPage.jsx:310,314` false positives: the label has `htmlFor`, the deprecated `label-has-for` wants nesting too) |
| wheel or pinch cancelled by a listener (any page, any row) | 0 | 0 |
| horizontal overflow (any page, any row) | 0 px | 0 px |

Measured, not a defect: no listener on these pages cancels a wheel or a pinch (`preventDefault`), so
the browser's zoom is never taken away, and nothing overflows sideways at 390 px. That is not the
same as "a wheel scrolls everywhere": L6 and W6 are wheels nobody cancelled that still moved nothing,
because the element under the pointer was outside the scroller. The script now reports that as
"wheel-dead area" (share of the screen where the element under the pointer is not inside the page's
scroller; fixed toolbars and chips count, so a few per cent is normal).

## Findings

Severity is Nielsen's. Size: S = one file, under an hour · M = a component's structure · L = across
owners. `MEASURED` = taken in Chromium by the script or a probe; `READ` = code reading only.

| id | where | heuristic / WCAG | device | sev | repro | size | state |
|---|---|---|---|---|---|---|---|
| S1 | `PasswordSignIn.jsx` fields | 2.4.7 · H1 | keyboard, desktop | 3 | `/login`, Tab: the focused field is identical to the other (border `rgba(77,249,255,.3)` both, outline none, no shadow). MEASURED | S | fixed `dec7525` |
| S2 | `PasswordSignIn.jsx` error line | 4.1.3 · H9 | screen reader, all | 3 | wrong password → the refusal is a plain caption, nothing announced. READ | S | fixed `80e1497` |
| A1 | `AdminManageSection.jsx` Rename / Edit public link fields (space and project) | 4.1.2, 1.3.1 (axe `label`, critical) | all rows | 3 | `/admin` → a space → Rename: an input with no name and an empty placeholder. MEASURED ×4 rows | S | fixed `811f66d` |
| L6 | `landing.css` hero background | H3 · touchpad/wheel standard of the brief | mouse wheel, touchpad, tablet touch | 3 | `/` at 1440×900: 66 % of the first screen is the room's canvas; 6 real wheel steps there (deltaX 12, deltaY 60) moved the page **0 px**, over the text 360 px. The canvas sits in `GridFloorBackground`'s `position: fixed` layer with `pointer-events: auto` set inline by R3F, so the wheel chains to the document, which does not scroll. MEASURED | S | fixed `bcb29f5` (after: 0 % dead, 360 px) |
| W3 | `WikiPage.jsx` layout under 800 px | H7, H8 | phone, tablet | 3 | `/wiki` on a phone: the first article starts **3,998 px** down (6.0 screens of 664 px), behind 118 contents links. MEASURED | M | OPEN — sketch: under 800 px the contents become one closed `<details>` "Contents (118)" under the search, or a `<select>` that jumps; search stays first; `#hash` arrivals unchanged |
| S3 | `PasswordSignIn.jsx` fields | H3 | phone (iOS Safari) | 2 | fields were 14 px; Safari zooms into a focused field under 16 px (the rule `deviceLogin.css` keeps). MEASURED 14 px; the zoom itself is UNVERIFIED (Chromium does not do it) | S | fixed `2e72a44` |
| A2 | `AdminManageSection.jsx` Directory rows | 2.1.1, 4.1.2 (axe `nested-interactive`, serious ×4) · H3 | all; keyboard | 2 | the caret was a `role=button` inside the row's button and the only way to close a space: a keyboard opened spaces and never closed one. MEASURED | S | fixed `c0cac23` |
| R1 | `AuthReturnNotice.jsx` | 4.1.3, 2.2.1 · H9 | all | 2 | `/wiki?auth=error`: "Sign-in failed" is a polite status and is gone at 7.5 s. MEASURED | S | fixed `176d2ee` |
| R2 | `authReturnNotice.css` Dismiss | 2.5.8 | touch | 2 | the "×" is 15.5 × 14.4 px. MEASURED | S | fixed `858f777` (24 px; 44 px under `pointer: coarse`) |
| W1 | `wiki.css` `.wiki-article-updated` | 1.4.3 (axe `color-contrast`, serious) | all | 2 | muted text at `opacity: .7`: 3.14:1 on the article ground. MEASURED | S | fixed `13a0770` |
| W2 | `wiki.css` `.wiki-search` | 2.4.7 | keyboard | 2 | `outline: none`; focus is a 1 px border going from one cyan to another. MEASURED | S | fixed `35f6b52` |
| W6 | `wiki.css` background | H3 | mouse wheel, touchpad | 2 | `/wiki` at 1440×900: the margins beside the text (25 % of the screen) are the same canvas; a wheel there moved 0 px. MEASURED | S | fixed `9c73f75` (after: 0 %, 360 px) |
| G1 | `AuthGate.jsx` cards, `/login`, closed door | 1.3.1, 2.4.6 · H4 | screen reader | 2 | the page's only heading is the logo, as an `h6`; no `h1`. MEASURED | S | OPEN — the logo or "Sign in" becomes the `h1` |
| G3 | `AuthGate.jsx` MUI buttons (Open Space, Your private sandbox, provider buttons) | 2.4.7, 2.4.11 | keyboard | 2 | focus shows only as MUI's faint pulsing ripple (3 stops on the closed door). MEASURED | S | OPEN — one `&.Mui-focusVisible { outline: 2px solid var(--ui-accent) }` shared by the card buttons |
| G4 | `PasswordSignIn.jsx`, `AuthGate.jsx` on touch | 2.5.8 (passes at 24) · brief's 44 px | phone, tablet | 2 | fields 32 px tall, Sign in 31, "Create one" 62×20, Open Space 96×31. MEASURED | S | OPEN — `min-height: 44px` under `pointer: coarse` |
| W4 | `wiki.css` `.wiki-sidebar-link` | 2.5.8 (passes by spacing: 23 px + 4 px gap) · brief's 44 px | phone, tablet | 2 | 342×23 on a phone, 118 of them. MEASURED | S | OPEN — `padding: 10px 0` under `pointer: coarse`; better folded into W3 |
| AD3 | `AdminManageSection.jsx` role buttons, toggles | 4.1.2 | screen reader | 2 | viewer/editor/admin and the access toggles carry their state only in a class or a "✓" in the label; no `aria-pressed`. READ | S | OPEN |
| AD4 | `AdminManageSection.jsx` errors | 4.1.3 · H9 | screen reader | 2 | load/save failures land in a `.preferences-empty` div, not announced. READ | S | OPEN |
| L1 | `LandingPage.jsx` | H4 | all | 2 | one address (`/spaces`) wears five names: nav "Spaces", hero "Step inside" and "The Spaces", footer "Spaces", and "Already have spaces? Open Studio →". "Step inside" also plays the flight; the others do not. READ | S (copy) | OPEN — owner's words decide the one name |
| L3 | `LandingPage.jsx` nav | 2.5.8 (passes by spacing) · 44 px | tablet | 2 | at 820 px the nav shows, links 15 px tall (Spaces 43×15, Wiki 25×15). MEASURED | S | OPEN |
| G2 | `AuthGate.jsx` cards, `PasswordSignIn.jsx` fields | brief standard "rectangles 0–2 px" · H4 | all | 1 | card corners 8 px, fields 4 px. MEASURED | S | OPEN |
| W5 | `WikiPage.jsx` lede | vocabulary.md "the page is not the changelog" | all | 1 | "Kept up to date as di.iiii grows." is a promise about us, not a fact for the reader. READ | S | OPEN |
| L2 | `LandingPage.jsx` footer | H2, vocabulary.md | all | 1 | an "API" link opens `/serverXR/api/health`, raw JSON about the host, in the visitor's footer. READ | S | OPEN |
| L4 | `LandingPage.jsx` closing CTA | vocabulary.md · H4 | all | 1 | "walk in and open your own room →": lower-case start, and "room" is not a dictionary word (space). READ | S | OPEN — owner's word |
| L5 | `LandingPage.jsx` scroll hint | 2.5.8 (passes by spacing) · 44 px | touch | 1 | "Scroll to learn more" is 20×20. MEASURED | S | OPEN |
| AD5 | `AdminManageSection.jsx` copy | H2 | all | 1 | "Backend/infra state — not audience-facing", "Leave empty to clear (falls back to id)": the builder's words, not the admin's. READ | S | OPEN |
| G5 | `AuthGate.jsx:592` token field | 2.4.3 | keyboard | 0 | `autoFocus` on the access-token field, disabled inline with a reason (it opens on request). READ | — | kept |
| DL1 | `DeviceLoginPage.jsx` | — | — | 0 | live regions, focus moves and labels are right; the two strict-lint hits are false positives. READ + MEASURED (0 axe) | — | no defect |

### Outside this area's files (reported for their owners, not touched)

| id | where | ref | device | sev | repro | size |
|---|---|---|---|---|---|---|
| X1 | `src/components/SurfaceBar` links (wiki) | 2.5.8 (passes by spacing) | touch | 1 | 13 px tall on desktop (di.iiii 48×13, Spaces 46×13) | S |
| X2 | `src/styles/preferences.css` `.preferences-input:focus { outline: none }` | 2.4.7 | keyboard | 2 | 4 of 9 admin Tab stops show no ring (New project title, the three GitHub sync fields) | S |
| X3 | `src/styles/preferences.css` `.preferences-nav-group-label` | 1.4.3 (axe serious ×2) | desktop, tablet | 2 | "ADMIN", "DIAGNOSTICS" labels under AA | S |
| X4 | `src/components/modeMark.css` (the LOCAL / tier chip) | 1.4.3 (axe serious ×2–4) | @2x, tablet | 1 | only on non-production tiers | S |
| X5 | `AccountButton` on the closed door | 2.5.8 · H8 | phone | 1 | a 30×30 "Sign in" icon in the corner of a card that already holds the sign-in form | S |
| X6 | `PreferencesPage.jsx` header "▾" | 2.5.8 | desktop | 1 | 22×22 | S |
| X7 | `src/wiki/wikiContent.js` (open PRs #1054/#1056; not touched) | vocabulary.md | all | 1 | the lighting desk is "the desk" in prose (e.g. the Fixture article); the dictionary's word is **Light** / "the lighting desk". 118 articles are what W3 measures | S |
| X8 | `src/studio/StudioHub.jsx` (`/spaces`; another session's redesign) | 4.1.2 (axe `nested-interactive` ×1, `.ssh-space-card`) · 2.5.8 (axe `target-size` ×3: the card's projects link, `.ssh-live-url`) · 2.4.7 | all rows; keyboard | 2 | measured on every row; the Grid / List / Map view switches draw a 0 px outline on focus (2–3 of 12 Tab stops with no ring) | S each |
| X9 | `src/RootApp.jsx`, `src/hooks/useResolveSpaceRoot.js`, `src/services/serverSpaces.js` (open PRs) | — | — | — | read only; nothing found in this pass | — |

## UNVERIFIED

- Nothing here was seen by a person on a real screen. iOS Safari's zoom-on-focus (S3), Safari's
  gesture events, a real touchpad's wheel deltas and a phone's on-screen keyboard were not run.
- Screen-reader output was not listened to; S2, R1, A1 and AD3–AD4 rest on roles and names read from
  the DOM (axe, testing-library), not on VoiceOver or NVDA.
- Early runs of the script opened a fresh browser context per page, and every context is a new guest
  session: serverXR allows 60 per address per 10 minutes, so later pages (`/spaces`, the closed door)
  were measuring the "We can't reach the server" screen (67 × 429 in the server log). The script now
  keeps one context per device row and prints `NOT MEASURED` for any page that saw a 429; the numbers
  in this file come from runs with none.
- The tablet row is touch: the landing's canvas also sets `touch-action: none`, so a finger drag over
  the hero on a tablet was very likely as dead as the wheel. L6's fix removes pointer events there
  too, but a touch drag was not measured.
- The landing's background scene renders with software GL here; its look was not judged.
