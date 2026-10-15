## 2026-10-13 — the Scenes picker in the Studio's own chrome; a Preview button in the Studio

- Owner 16:3x "make it suit the Studio style … from the Studio I can't find the button to go to the preview".
- `ScenePicker.jsx` keeps its behaviour and tests (open by default, fold, Follow the show / Work light, the one-line intent
  under each name, `aria-pressed`) and loses every inline style. It is drawn with the Objects window's classes (`sfp-shell`,
  `sfp-header`, `sfp-title`, `scc-collapse-btn`, `sfp-content`), the cluster's `scc-btn` (`active` = pressed) and the Objects
  list's `spa-list` / `spa-item` rows. Only the geometry is new (`.scene-picker`, end of `studio.css`): docked bottom-left
  ABOVE the 44 px strip (`--di-mode-mark-clearance`) that holds the view label ("Perspective", bottom 12 / left 14), the mode
  chip and the bottom-right tree chip, so none is covered at any width; rectangles (`--di-radius`, 2 px); every target ≥ 32 px.
  jsdom has no layout, so the geometry is pinned by reading the stylesheets (as `TreeChip.test.jsx` does): the picker's strip
  is higher than the label's and the chip's tops, no radius of its own, 32 px minimums.
- Preview: `StudioControlCluster` Display row, right after "? Help", `window.open(url, '_blank', 'noopener')`. The address
  (`utils/previewUrl.js`) is `/{space}/{slug}` when the project has a slug, else the permanent `/{space}/p/{id}`; same origin
  as the Studio, so a local install stays local and a tree stays on its tree. The slug is NOT on the document
  (`projectMeta` = id, spaceId, title, …): `StudioEditor` reads it from the project record (`getProject`), keyed by id, and
  falls back to `/p/{id}` until it arrives or when it cannot be read. "View live" is unchanged: it opens the SPACE and is drawn
  only on the space's live project, which is why a project being edited had no way across.
- Not seen in a browser (heat 96-100 C, no browser tests on aylmo until the owner says): the look and the geometry are from
  the stylesheets and jsdom only.
