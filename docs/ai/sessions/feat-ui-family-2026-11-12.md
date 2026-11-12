## 2026-11-12 — Studio: number-keys switch and "GO on Light" with a replace question

- Keys 1-9 in Studio now have a visible Keys 1-9 row (and a collapsed-header chip) with one-touch off, kept on this device; default stays ON.
- The scene editor's "Play" is now "GO on Light"; before loading it reads Light and asks once if Light runs another project's cue list.
- Written without running anything (the machine was under a frame-rate gate), then checked on a throwaway CPU box: the 13 test files that load the changed modules, eslint on the changed files, and the push checks. The first box run failed `src/copyVocabulary.test.js` (the wiki paragraph said room) and `docs:ai:check` (the box's git branch was not this branch); the word is fixed.
- Known limit: the editor's GO skips the cooldown and who-may-choose guards of `RoomFavourites.jsx`.
- Review fixes: an unnamed Light list asks, ids compared by their first 64 characters; the confirm uses the asked answer's replace(); GO on Light only drawn with onPlay; no aria-pressed on the two toggles; the row note is one line.
