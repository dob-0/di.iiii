## 2026-10-29 — Play: editor keys cannot touch the saved project while playing (review fixes for #1220)

- One shared flag, `src/project/play/playingFlag.js`: PlayLayer holds it while mounted; the Studio shell, editor, camera, walk, cues, box select and the viewport kick return early while it is held. Delete, Ctrl+D, Ctrl+Z and F no longer reach the saved project or the editor camera during Play.
- The flag is released one macrotask late, so the Esc that ends Play no longer closes the Objects window on its way out.
- Fly is hidden inside Play (`walkKeyHintText({ fly })`); Armenian words for PLAYING and Stop sit on the i18n check page (`docs/ai/vocabulary.md`, unverified).
- Test: `StudioEditorPlayKeys.journey.test.jsx` drives the real keydown path (select, Play, Backspace, Ctrl+D, Ctrl+Z, Stop → fingerprint equal).
- Not done: the browser picture run selected no object (the click on a row did not select), so that case rests on the journey test; the walk in the scratch stack showed an empty room ("loading the room").
