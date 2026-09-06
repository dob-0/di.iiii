# Fallback glyphs for 3D text, served from here

troika-three-text draws every `<Text>` with the house face (`/fonts/inter-regular.woff`,
see `src/project/viewport/troikaFont.js`). Characters that face does not carry — Armenian
first of all — are resolved by `unicode-font-resolver`, which by default fetches its index
and font files from cdn.jsdelivr.net at render time. With no internet every Armenian label
silently painted nothing (measured on a `di` install, 2026-09-06).

This directory is a subset of `lojjic/unicode-font-resolver@v1.0.1/packages/data`, laid out
exactly as the resolver expects, and `troikaFont.js` points the resolver here:

- `codepoint-index/plane0/500-5ff.json` — the block that holds Armenian (U+0530–058F)
- `font-meta/armenian.json` — trimmed to the two weights vendored below
- `font-files/armenian/sans-serif.normal.{400,700}.woff` — Noto Sans Armenian, 10 KB each

Anything not here (Georgian, Hebrew, CJK…) still goes to the CDN when there is one — the
resolver falls back to its default URL on a miss — and degrades as before without one.
To add a script: copy its index block, its `font-meta` file and the weights you want.
