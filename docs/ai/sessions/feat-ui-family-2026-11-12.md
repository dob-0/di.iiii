## 2026-11-12 — Studio: number-keys switch and "GO on Light" with a replace question

- Keys 1-9 in Studio now have a visible Keys 1-9 row (and a collapsed-header chip) with one-touch off, kept on this device; default stays ON.
- The scene editor's "Play" is now "GO on Light"; before loading it reads Light and asks once if Light runs another project's cue list.
- Written without running anything (the machine was under a frame-rate gate): the new tests have not been run yet; run `npx vitest run` on the five test files named in docs/ai/known-fixes.md before merging.
- Known limit: the editor's GO skips the room page's cooldown and who-may-choose guards.
- Review fixes: an unnamed Light list asks, ids compared by their first 64 characters; the confirm uses the asked answer's replace(); GO on Light only drawn with onPlay; no aria-pressed on the two toggles; the row note is one line.
