## 2026-10-15 — the room's render quality reads Low / High, not Lite / Full (old words stay as aliases)

Owner 2026-10-15 06:1x: "Full and Lite do not suit … look at the global lexicon, and fix that all."
Decision: the setting is **Quality**, its values **Low** and **High** (the field's words for a renderer's two presets: game and video-player
quality presets, Blender render presets; HD / HQ name video formats). Row added to `docs/ai/vocabulary.md`; `Lite` and `Full / Lite` banned in
copy by `src/copyVocabulary.test.js`.

- The button shows the quality in USE now (as before); its title says what a tap switches to.
- Compatible: keys stay; `normalizeQuality()` (outputMode.js) reads `lite|full` and `low|high` alike, from `?quality=` and from sessionStorage; new
  writes are `low|high`. Tested both ways (outputMode.test.js).
- Wiki 'room-quality-lite-full' retitled "Low and High — …" (id kept so links stand); comments, tests, visitor-chrome label "Walk / Fly and Quality".
- Left as written, on purpose: dated session notes, audits, known-fixes and MOXIR history (they record what was said then).
- Tests: outputMode, PublicProjectViewer, MoveControl, wiki, copyVocabulary, rigbuild, shared → 1893 pass; 1 fail is
  `scripts/rigbuild/noSupplierPrices.test.js` on `moxir-v2-10-lines-2026-10-15.json $.total = 40`, a file of the base branch, not touched here (owed to its owner).
- Owed: no `tools/lint-words.sh` in this repo; the guard test is the machine check.
