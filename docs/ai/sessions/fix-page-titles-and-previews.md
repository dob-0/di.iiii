## 2026-09-14 — every page names itself, in the tab and in a link preview

Every route's browser tab used to say "di.iiii — public spaces on the open web" —
/wcc, /network, /open, /login, a 404, all of it — and a crawler's link preview
(`curl -A Twitterbot`) of /login, /terms, /for-apps, /spaces, a real space or a
project inside one all returned the homepage's og:title/og:description. Sharing a
space showed nothing about the space. Fixed both surfaces, applying the naming rule
already in `docs/ai/vocabulary.md`: a space's own name is what a visitor sees for it
(tab, card, preview); a project's name shows only when the URL itself named that
project.

- New `src/hooks/useDocumentTitle.js` — the one place `document.title` is set, with
  cleanup that restores whatever the title was before. A falsy title means "leave it
  alone", used deliberately for the platform's own space (`main`) and for a
  still-loading project, so neither ever overwrites or flashes over the index.html
  default.
- Wired into: `SpaceSurfaceApp.jsx` + `PublicProjectViewer.jsx` (a space names
  itself; a project names itself only via `showProjectInTitle`, set only on the
  explicit `/{space}/p/{project}` route — not on a bare space whose front page
  happens to be a published project), `RootApp.jsx`'s `WorkSurfaceRoute` (`/wcc`,
  `/algovrithm` — a work is a real space), `AuthGate.jsx` (`/login` → "Sign in — di.iiii";
  the "Nothing lives at…" card, and only that one, → "Not found — di.iiii"),
  `SpaceHub.jsx` (`/spaces`), `WikiPage.jsx` (the article named by the hash the page
  was opened on, read once — the page is one long scroller, not per-article routes).
- `TermsPage.jsx` / `PrivacyPage.jsx` / `ForAppsPage.jsx` moved onto the same hook and
  corrected to Sentence case ("Terms — di.iiii", not "terms — di.iiii").
- `serverXR/src/routes/ogRoutes.js`: a `STATIC_PAGES` table gives `/login`, `/terms`,
  `/privacy`, `/for-apps`, `/spaces`, `/wiki` their own card instead of falling
  through to the front door (none of these words can ever be a space — checked
  before any space lookup runs at all). And the route now resolves a project the URL
  itself names — the explicit `/{space}/p/{project}` shape and the vanity
  `/{space}/{projectSlug}` form — via a new `resolveProject` hook wired in
  `index.js` the same slug-then-id way `/api/resolve/...` already does; only a
  `state: 'live'` project ever previews as itself, matching the same "drafts and
  archived work never reach a visitor" rule the space's own contents listing keeps.
  A reserved second segment (`/raw`, `/studio`, …) is never misread as a project slug
  — `shared/reservedSegments.cjs`'s `RESERVED_PROJECT_SLUGS`, the same set the client
  router already uses.

Tests: `useDocumentTitle.test.jsx` (new); title assertions added to
`ForAppsPage.test.jsx`, `TermsPage.test.jsx` / `PrivacyPage.test.jsx` (new, small),
`AuthGate.test.jsx` (login + the not-found/restricted distinction), `SpaceHub.test.jsx`,
`WikiPage.test.jsx`, `SpaceSurfaceApp.test.jsx`, `PublicProjectViewer.test.jsx`,
`RootApp.test.jsx` (/wcc, /algovrithm). `ogRoutes.test.js` gained a
`reserved top-level pages` describe (6 static routes) and `a project the URL itself
names` describe (explicit + vanity shape, draft rejection, reserved-segment
rejection, unknown-slug fallback) — 28 tests total there, up from 16. `npm run lint`
clean (0 errors); `npm run test:server-contracts` (131 tests) and every touched
vitest file green.

Verified locally against a throwaway `DATA_ROOT`: headless Chromium (Playwright,
`--disable-gpu`) read `document.title` on `/`, `/login`, `/wiki`, `/spaces`, `/wcc`,
and a private-space 404, and `curl -A Twitterbot` against `/serverXR/og/...` for
`/login`, `/terms`, a seeded public space and a project inside it.

Left open: the admin console (`/admin`) and the in-space authoring surfaces
(`/{space}/studio`, `/raw`, …) were deliberately left untitled by this change — they
are authenticated tool surfaces the task's naming rule does not name, and touching
`App.jsx`'s preferences branch was out of scope. `/tools` likewise keeps the
platform's default title. The og card's per-project description is a generic
sentence (`"<title> — a project in <space> on di.iiii."`) since project rows carry no
`ogDescription` field yet — same shape a space without one already falls back to.
