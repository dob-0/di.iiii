## 2026-09-14 — /open and /open_jam/scene are now the same room

Fixed three gaps in Open Jam's public facade (branch `fix/open-jam-one-room`).

**(a) Two experiences, one room.** `/open` — the address a visitor is actually
handed — rendered a completely different surface than the front page's own
"Open Jam" button (`/open_jam/scene`): a read-only Walk/Fly viewer with no
presence and no way to add anything, instead of the live, interactive jam.
Not a data problem — both addresses already resolved to spaceId `open` /
projectId `open-jam` (the 2026-09-03 `publishedProjectId` fix). It was a
routing gap: `jamRouting.js`'s `getJamLocationState` matched only the exact
`/open_jam/scene` alias, so the bare space address fell through `RootApp.jsx`
to the generic `SpaceSurfaceApp` → `PublicProjectViewer` path instead of the
`JamSurface` the alias renders.

Fix: `getJamLocationState` now also matches bare `/open`, carved out for
`?preview=1` (the space card's own thumbnail embed in `SpaceHub.jsx`, which
wants the static published picture, not a live surface with open presence
sockets rendered at thumbnail size — the card's "make it live" button
re-embeds `/open` with no `?preview` and correctly gets the real jam). No
tier data was touched, and none needs to be — the existing
`publishedProjectId` pointer on space `open` was already correct on the tier
checked (dev); this was purely a client routing decision.

**(b) No way to share it.** Added a Share control next to the ＋, in the same
thumb-reach band at the bottom of the screen (not the topbar, which a
one-handed phone at an event does not comfortably reach). On a device with
`navigator.share` it opens the native share sheet; everywhere else it copies
the plain `/open` link to the clipboard (same pattern as
`StudioChatSurface.jsx`'s `shareRoom`). The link handed out is the bare
`/open` address, not the `/open_jam/scene` alias — shorter, and as of (a) it
opens the identical room.

**(c) The add sheet.** `.jam-sheet` used `--di-scrim-strong` (0.9-alpha veil),
which let the room's own wall text and photos show through — the one place in
the jam where someone is reading a form rather than looking through a window
onto the scene. Moved to `--di-surface` (opaque, matching every other
floating panel) with a `--di-cyan-line` top border. Reordered `JamSheet.jsx`'s
`AddFace`: photo and text first, the four shapes (box/sphere/cone/torus)
after — a stranger came with their own picture or their own words, not a
torus.

### Changed

- `src/project/routing/jamRouting.js` — bare `/open` match, `?preview=1` carve-out
- `src/project/routing/jamRouting.test.js` — updated + new coverage
- `src/project/components/JamSurface.jsx` — share control
- `src/project/components/JamSheet.jsx` — add-sheet tile order
- `src/project/components/jamSurface.css` — opaque sheet, share button styling
- `src/project/components/JamSurface.test.jsx` — share (native + clipboard fallback), tile order
- `src/wiki/wikiContent.js` — `guest-and-sandbox-modes` and `jam-surface` articles updated
- `docs/ai/known-fixes.md` — two entries

### Verified

Headless Playwright against a local `serverXR` on a throwaway `DATA_ROOT`
(never the real local install data), desktop 1440x900@2x and phone
390x844@3x. Screenshots in
`/tmp/claude-1000/-home-dob/9ac84bd1-9ba0-4f1c-8ba6-e016a7b34415/scratchpad/wave1/jam/`.
`npm run lint` clean (0 errors, only pre-existing warnings elsewhere).
`npx vitest run` green across `src/project`, `src/wiki`, `src/copyVocabulary.test.js`,
`src/RootApp.test.jsx`, `src/SpaceSurfaceApp.test.jsx`, `src/studio/components/SpaceHub.test.jsx`.

### Still owed (not done here)

Nothing per-tier. The routing fix works off the existing `publishedProjectId`
pointer, which was already correct on every tier per
`project_dii_open_space_cleanup.md` (`/open` has pointed at `open-jam` on
local + staging since 2026-09-03, and prod got the same PATCH the same day).
If any tier's `publishedProjectId` for space `open` is ever repointed away
from `open-jam`, `/open` will correctly stop being the jam and show whatever
IS published there — that is the generic viewer's job, unchanged.
