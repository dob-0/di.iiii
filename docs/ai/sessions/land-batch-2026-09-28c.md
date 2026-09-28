## 2026-09-28 — batch: five checked fixes land together (#592 #597 #601 #604 #605)

Each PR was green or BEHIND only because every one appends to `docs/ai/known-fixes.md`;
merged in order onto dev, the only conflicts were that file, resolved as a union (six rows
added, none lost, no marker left). Each fix keeps its own session note in this batch.

One real catch from putting them together: #592's own CI was red and was reported as green.
`src/components/surfaceBar.embed.test.jsx` mocks `useMapDocument` without the new
`undo/redo/canUndo/canRedo`, so the Projection desk threw `canUndo is not a function` in
two bar tests. The mock now carries them. Gate on the batch: build ok; vitest 6331/6331
(6 skipped); server contracts 174/174; lighting wiring all passing; docs:ai:check ok.
