## 2026-09-15 — one name for /open and /wcc, matching the stored space label

Owner settled the wave-2 naming decisions: `main` stays "di.iiii" (no change),
`br_id_ge` keeps its underscores (no change), dev test scenes stay listed in
`/open` (no change), `open` is "Open Space" everywhere, and `/wcc`'s page
heading should match its card/list name.

- Checked stored data first: `spaces.label` for `open` ("Open Space"), `wcc`
  ("WCC Exhibition") and `main` ("di.iiii") already matches the decision on
  local, dev.diiii.xyz and prod — the "/open shows three names" symptom from
  the 2026-09-14 audit was hardcoded UI copy, not stale data. No data write
  was needed on any tier.
- `src/landing/LandingPage.jsx`: front-page CTA button linking to `/open` said
  "Open Jam" — now "Open Space" (updated its test in
  `src/landing/LandingPage.test.jsx` and `src/landing/landingRoutesEnter.test.jsx`).
- `src/project/components/JamSurface.jsx`: the native share-sheet title for
  `/open`'s Share button said `'Open Jam'` — now `'Open Space'`. `JamSurface`
  is only ever mounted for the `open` space (`JAM_SPACE_ID` is fixed to
  `OPEN_JAM_SPACE_ID`), so the literal is safe.
- `src/wccSite/landing/LandingPage.jsx`: the `/wcc` landing hero `<h1>` read
  "WCC: Women Creating Change" — now "WCC Exhibition", matching the card/list
  name (`src/works/works.js`'s `label: 'WCC Exhibition'`). Chose the card's
  name over the fuller exhibition title because this heading is exactly the
  class of thing the wave-2 naming rule already fixed for `/network` and
  `/dilijan` (a bespoke pre-rule heading duplicating what the space's own
  chrome name says) — the fuller name ("WCC: Women Creating Change") is real
  and correct, but belongs inside the work as body copy (kept, untouched in
  `landingContent.subtitle`), not as the outer heading.
- `src/wccSite/WccExperience.jsx`: the in-scene room title (shown while
  walking `/wcc/scene` with no artist selected) said "WCC · Women Creating
  Change" — now "WCC Exhibition", for the same reason; the per-artist case
  (`ARTIST_TITLES[activeProjectId]`) is untouched, since that is "inside a
  project" per the naming rule.
- `Open Jam` is still the correct name for the actual jam *project*
  (`OPEN_JAM_PROJECT_ID`'s `title`) inside Studio/Raw — untouched, since a
  project's own name is only supposed to show inside that project, never in
  the space's outer chrome.
- Not touched (out of scope, judged as body/marketing copy rather than
  chrome naming the space): the front landing page's "Open Jam room" example
  caption under "One that's live", and `src/wiki/wikiContent.js`'s prose
  about the Open Jam.

serverXR's `node_modules` was missing in this fresh worktree (`npm ci` only
ran at the repo root) — installed it there too before trusting
`npm run test`'s server-contract results.
