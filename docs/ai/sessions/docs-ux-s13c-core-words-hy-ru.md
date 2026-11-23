# docs/ux-s13c-core-words-hy-ru

## The six core words in Armenian and Russian, and one page for the owner to check them

- 2026-10-29, languages design slice S13c (decision `docs/ai/decisions/2026-10-29-languages-in-the-address.md`,
  committed here unchanged from the design run). Owner: "ok fix everything"; B with Russian too (N1490).
- `docs/ai/vocabulary.md`: a new section with space, project, scene, object, place and production in Armenian and Russian,
  12 rows, each `unverified`, source `machine:claude-opus-5-5@2026-10-29`, one line on why. Where the sketch
  (`docs/design/lang-switch/concept-b.html`) and the camp's table (`src/make/makeVocabulary.js`) differ is written under it;
  the main difference: on `/make` a project is սենյակ (room), stays as `/make`'s own mode.
- `scripts/i18n/review.mjs`: `list`, `page [--out]` (English | Armenian | Russian | state, one row per word, dark, noindex),
  `check <word> <lang> --by <name> [--says]` writes his answer back as `checked`, `human:<name>@<date>`. Test
  `scripts/i18n/review.test.js` (fails on dev: the script and the rows do not exist).
- Not app code: nothing in `src/` changed. No wiki entry (no user-facing surface) and no known-fixes entry (not a bug fix).
- Owed: the owner's check of the 12 rows (the lead shows him the page); a native Russian speaker he names; Armenian and
  Cyrillic fonts on the page come with S13d (today they fall back to the system font).
