## 2026-09-10 — dev went red because source comments cited session notes

- `dev`'s test job folds session notes in place (the `land` job cannot push:
  branch protection rejects it, GH006), so any `docs/ai/sessions/*.md` path
  written into a source comment is a dangling link by the time `docPaths.test.js`
  runs. Four such citations landed on 2026-09-10 and every staging deploy since
  has failed — spine-rhythm, network-cv-truth, wcc-landing-project and the
  lighting door all stopped at the gate.
- The four now cite `PROGRESS.md`, which is where the note's text ends up.
- `docPaths.test.js` gained a second test: no source file may cite a session
  note at all, so this fails on the branch that writes it instead of on `dev`.
- Underneath is still the owner's call: give the github-actions app a bypass on
  `dev`'s rules so the fold commit can land, or keep folding by hand.
