## 2026-09-10 — one style, one bar, one way to pack the work

Five steps the owner approved from an audit page (`/what-we-have/p/shape`), after
three parallel audits measured what the surfaces actually look like, how they
connect, and how work is held. Every step landed on `dev`, deployed to staging,
and was installed on the owner's own machine as a `di` build before being called
done.

- **The spine.** `base.css` now declares what the surfaces were already USING and
  nobody had declared — `--di-ink`, `--di-dim`, `--di-line`, `--di-bg` were read
  everywhere with hardcoded fallbacks, a second palette that nobody chose. Added
  with them: `--di-faint`, the surface ladder each screen re-invented in hex, the
  accent's two tints, two corner values, a five-step space rhythm, a type scale.
  Deleted from the three converted stylesheets: `#4fd6ff` (a near-miss cyan, 15
  uses), `#53d79b`, `'Space Mono'`, `'Outfit'`, and every radius that was not 0
  or 2px — nine were live. Global `:focus-visible` ring (per-surface
  `outline: none` had deleted the browser's and replaced it with nothing) and one
  `prefers-reduced-motion` rule. `src/styles/spine.test.js` enforces it per file;
  `SPINE_FILES` grows as files convert and `NOT_YET` names the debt out loud.
- **The bar.** `SurfaceBar` on `/tools`, `/wiki`, the bare node canvas and every
  walked room: where you are on the left, the same six destinations on the right,
  `Light` only on a local install, Studio and Nodes scoped to the space you are
  standing in. Two surfaces had no way out AT ALL — the lighting desk (no
  wordmark, no menu, nothing) and `main` walked, whose badge suppresses itself on
  the assumption that `/` is already that room, true on di-studio.xyz and false
  on an install. The desk keeps its own dense booth skin, now written down as a
  decision, and gets one door home.
- **The map.** Every star drew its name twice in two typefaces, labels scaled
  with depth (30px near, 6px far), and the ring spread linearly so the 22nd space
  sat 31 units out and the view opened cropped. One name, one size, `sqrt`
  spacing, and `fitDistance()` fitting the disc by width AND by its foreshortened
  height from the frame's MEASURED aspect — fit one and the other crops, and
  which binds depends on the window.
- **Collections, draft/live/archived, and a trash.** There was no container
  between a space and a project (one space holds 74 of 200), no archive but five
  titles with `[archived]` typed in front, and `deleteProject()` was
  `deleteById.run()` + `rm -rf` in the same call with no undo anywhere. A
  collection is a shelf inside a space that holds work by reference; deleting a
  shelf loosens rather than deletes. Delete now marks `deleted_at`, leaves every
  byte, answers with `restorableUntil`, and only `purgeTrash()` (on the existing
  half-hour sweep, 30 days) removes anything. `upsertProjectMeta` un-trashes, so
  restoring a snapshot over a deleted project brings it back instead of failing
  on a UNIQUE constraint.
- **Two bugs that were one.** `/make` and `/light` on a hosted tier both fell
  through as a lookup for a space that can never exist, because
  `RESERVED_APP_SEGMENTS` was guarded at `segments[1]` and never at `segments[0]`.
  No nginx change needed: nginx never proxies `/` to Node.
- **Beyond Form's 13 files were never lost** — production had them whole. A code
  page's uploads are written into the built markup and never into
  `document.assets`, which every transfer script read and nothing else, so the
  pull said "0 assets" and exited clean. `collectProjectAssetRefs()` reads the ids
  off the document itself, and `npm run assets:audit` names any project whose
  tier lacks files it references.

Left open, in the tree: `npm run assets:audit`'s first run found five more broken
projects nobody had been told about (`open/front-room`, `front-room-light`,
`look-signal`, `look-night`, `look-paper` — 76–78 referenced assets each, present
on no tier, ids from before content addressing). `algovrithm` is still a public,
empty space permanently shadowed at its own url by `src/algoVrithm/`. Five
stylesheets remain unconverted, named in `spine.test.js`.
