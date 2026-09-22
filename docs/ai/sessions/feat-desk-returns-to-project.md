## 2026-09-23 — Light returns to the project that opened it

- Wave 1 item 3 of `di-atlas/decisions/2026-09-23-connect-everything.md`. The stranger's walk
  found "Light: show forgotten, no way back": the desk's only exit, `a.homelink`, went to `/spaces`.
- A project now opens the desk as `/light/?space=<id>&project=<id>[&label=<title>]`. The new
  `serverXR/src/lighting/ui/from.js` reads that once and keeps it per tab in sessionStorage; `app.js`
  draws `← <project>` beside the di.iiii door (→ the project in Studio) and Studio · Nodes · Projection
  for the same project, all with the existing `.homelink` / `.pages` classes and no new CSS. The page
  tabs only change the hash, so the links stand through every switch; the kept copy covers a reload
  whose address lost its query. A bare `/light/` in a fresh tab is unchanged: one door, to `/spaces`.
- The three addresses are a hand copy of `buildStudioProjectPath`, `buildRawProjectPath` and
  `buildMapPath` (the desk is plain script and cannot import). `src/map/lightingLink.test.js`
  requires `from.js` and holds it to the real builders — seen failing when the copy was made to drift.
  An id with a slash, dot, backslash or colon draws nothing, so the query cannot aim the link elsewhere.
- Callers: Projection's Light link passes the query (`lightingDeskPath({ spaceId, projectId, label })`).
  The SPA's `/light` hand-off (`RootApp.jsx`) now keeps `location.search`, which it used to drop.
  `/tools`' Light tile knows no project and is unchanged. `SurfaceBar.jsx` is left to
  `feat/bar-carries-project`, which agreed on the same `?space=&project=` shape.
- Walked on a throwaway stack (4320/5320) at 1440×900 and 390×844 DPR 3: back link survives Setup →
  Control → Touch → Fader → MIDI and a reload without the query; it opens `/lab/studio/projects/first-piece`
  in Studio; Nodes and Projection open their pages; bare `/light/` still leads to `/spaces`.
- Seen and left: at 1440 the desk's centred title ("Art-Net Desk — <show>"), already clipped before,
  is squeezed to a few letters while the project links show. On a phone they add one row, and the links
  are ~25 px tall, the same as the existing di.iiii door.
