# public/fonts

Two unrelated sets live here.

## UI typefaces (self-hosted, loaded by `src/styles/base.css`)

| file | family | source | license |
|---|---|---|---|
| `inter-latin-wght-normal.woff2` | Inter | `@fontsource-variable/inter@5` (Rasmus Andersson) | OFL-1.1 |
| `jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono | `@fontsource-variable/jetbrains-mono@5` (JetBrains) | OFL-1.1 |

Variable-weight, latin subset, ~48 KB and ~40 KB. Both are declared `@font-face` in
`src/styles/base.css` and preloaded in `src/index.html`.

Self-hosted on purpose. They were named in the tokens for a long time and loaded from
nowhere, so the app rendered in whatever the visitor's OS happened to have — and a local,
offline-first di.iiii cannot fetch a webfont at a venue with no wifi.

To update: re-download the same paths from `cdn.jsdelivr.net/npm/@fontsource-variable/<family>@5/files/`.

## Three.js typeface JSONs

`helvetiker_*`, `gentilis_*`, `optimer_*` — geometry data for 3D text in the scene, not UI
fonts. Covered by the adjacent `LICENSE` (MgOpen, MAGENTA Ltd).
