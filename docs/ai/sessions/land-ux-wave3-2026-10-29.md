## 2026-10-29 — land/ux-wave3-2026-10-29: UX wave 3 batch (S15, S19, S22, S18)

- Lands four reviewed PRs on top of origin/dev in this order: #1210 fix/ux-s15-no-3d-where-flat, #1211 fix/ux-s19-page-titles, #1212 feat/ux-s22-rig-next-step, #1215 feat/ux-s18-code-editor. Each keeps its own session note; nothing else in any file was changed.
- Why one batch: all four append to the end of docs/ai/known-fixes.md, so every merge made the other three conflict. One merge run settles it once instead of three rebases.
- Conflict 1 (after #1210, #1211, #1212, #1215): docs/ai/known-fixes.md. Each branch added its entry at the end. Resolved keeping both sides (every entry of every branch kept, none edited).
- Conflict 2: src/wiki/wikiContent.js, article "How content flows" (#1215 on top of #1210). Both changed the "Code:" bullet. Kept the #1210 bullet (page-only projects: page tools, Add a scene) and added #1215's new bullet about the code editor (line numbers, colours, find, Esc then Tab, plain text box). The `updated` dates did not conflict and stay as dev and the branches set them.
- Nothing is dropped: the plain text box stays as a choice beside the new editor (#1215's own mode).
- Still undone: pushing, the PR and the merge are the lead's.
- Review fix: in the full root suite (1199 files, cooled) CodeEditorArea.test.jsx failed once with "textRange(...).getClientRects is not a function": CodeMirror measures on an animation frame, and jsdom has no Range layout. It passed 3 of 3 times alone, so it fails only under load, which CI's shards can hit too. The test file now stubs Range.getClientRects and getBoundingClientRect when missing; no product code changed.
