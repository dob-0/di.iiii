## 2026-09-23 — the bar carries the project across Studio, Nodes and Projection; Light shown on hosted tiers

Wave 1 items 1, 2 and 4 of `di-atlas/decisions/2026-09-23-connect-everything.md`.

- `SurfaceBar` takes `project` / `projectLabel`. With one, the "where" reads
  `di.iiii · space · project` (the project opens its Studio editor) and Studio, Nodes and the
  new Projection destination open THAT project through `studioRouting` / `rawRouting` /
  `mapRouting` builders. Projection is listed only for a project. Order unchanged otherwise.
- Light is always listed. Local install: `/light/?space=&project=` (plain link — the desk is
  served by serverXR, not the app). Hosted: `/light`, navigated in-app (`appNavigate`) so it
  lands on the existing `ReservedAddressCard('light')`; a ctrl/meta click is left to the
  browser. Checked: a full load of `/light` and `/light/` on dev.diiii.xyz and diiii.xyz
  answers the SPA's index.html, so reload/new tab reach the card there too.
- `/tools` shows the Light tile on hosted tiers ("on your own machine", same in-app
  navigation). Desk stays local-only.
- The bar is mounted on the three editors: `StudioShell` (desktop and phone, `float`; hidden
  in Hide UI, XR presenting, `?embed=1` and the jam's simple mode), `RawEditor` (project
  canvas only; hidden in zen / a chromeless scope, the full-screen room and `?embed=1`; the
  raw topbar moves to `top: var(--sbar-h)` and its measured inset re-reads when the bar comes
  and goes), `MapSurface` (a row above `header.map-bar`, which is untouched; `/out` is
  `MapOutput` and never draws it). The tools' own jump buttons all stay (decision 5).
- Studio panes clear the floating bar through `--svl-top-clear` (gizmo, split controls,
  transform HUD) — only panes touching the top edge; the lower half of a V split does not.
- **`--sbar-h` was wrong.** It said 36px; the bar measured 38px (desktop) / 42px (phone), and
  40/44px in Studio, which lends a 1.5 line-height. Fixed in `surfaceBar.css`: the bar pins its
  own `line-height: 1.3`, declares 38px / 42px (phone media query), and `flex-shrink: 0` on the
  bar and on `.sbar-where`. The last two fix two defects that were already on dev: `/tools` on
  a phone squeezed the bar to 15px (flex column), and on a phone the space name collapsed to
  0px ("di.iiii · ·") because the links took every pixel. Desktop Tools / Wiki / projects are
  unchanged at 38px.
- On a phone the Nodes corner wordmark (`.raw-surface-wordmark`, top-left, z 1200) is hidden
  while the bar shows — it sat on the bar's own "di.iiii"; before this the topbar (z 1400)
  covered it whenever chrome showed.
- New `src/hooks/useSpaceName.js`: one `getServerSpace` for the space's label on Nodes and
  Projection (vocabulary.md "One name per space"); falls back to the id.
- Tests: `SurfaceBar.test.jsx` (hrefs, Light local/hosted, in-app click, new-tab click),
  new `ToolsRoom.test.jsx`, `surfaceBar.embed.test.jsx` (three editor lanes page vs window,
  plus headset, Hide UI, zen, full-screen room, both `/out` pages, and the topbar offset).
  Each of the seven hide guards was seen failing with its rule removed.
- Verified in a real browser on a throwaway stack (server :4310 loopback, vite :5310, data
  under the worktree) at 1440×900 and 390×844 DPR 3: Studio → Nodes → Projection → Studio by
  the bar, zero overlaps measured against the bar, no bar on `/out`, `?embed=1`, Hide UI.
  With the local flag off, Light from the bar and from /tools lands on the card, no page load.
- **Open, not done here:** at 390px the bar scrolls sideways (its existing phone rule), so
  Projection / Tools / Light / Wiki are one swipe away on the first screen. The bare node
  canvas (`/raw`, BlankNodeWorkspaceApp) still has the old overlaps: its raw topbar (z 1400,
  top 0) covers the floating bar when chrome shows, and on a phone its wordmark sits on the
  bar in zen — untouched here, out of this unit's scope. The Studio phone gizmo still sits
  under the `smb-topbar` buttons, as it did before.
