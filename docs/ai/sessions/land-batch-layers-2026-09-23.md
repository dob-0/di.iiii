## 2026-09-23 — batch landing: layer by layer (units 1–4, 6, 7 of the layers plan)

Two green PRs landed as one batch, per `feedback_batch_land_behind_prs`: they share five
files, so landing one would have put the other BEHIND. Plan:
`di-atlas/decisions/2026-09-23-layers-what-inside-what.md`. Each PR's own session note rides
in this batch; this note is for the batch branch itself.

| PR | Branch | What |
|---|---|---|
| #545 | `feat/things-are-cards` | Units 4, 6, 7: grouped things stand where Studio shows them in Nodes' room; every thing in the room is a card on the Nodes canvas and a row in its outliner; one edit on release when dragged in Nodes' room; the palette's "things" group makes the same thing Studio's Add makes; zen counts things and waits for the store's `hasLoaded` |
| #546 | `feat/layers-open-bare` | Units 1, 2, 3: `src/project/layers.js` (+ `shared/layers.cjs`, kept identical by a test) says what each layer holds; project cards and space cards say what they hold; a new project opens bare (bar, room, Create, hint); the bar grows inside a project (Nodes with the first thing, Projection with the first node or wire, Light with a lamp); "⚒ All tools" on every project; `npm run count:controls` |

Shared files: `projectStore.js` and its test carry ONE `hasLoaded` flag (#546 took #545's
hunk as written, so git merged them as one); `RawEditor.jsx` and `wikiContent.js` merged by
themselves. One conflict, `docs/ai/known-fixes.md`: both sides appended table rows; all four
rows kept.

Still the owner's: questions 2 (a thing inside a Geo) and 3 (which one is "the Desk") of the
plan; the phone bar cutting off at 390 px (a design call, the bar may not be restyled); the
word "thing" beside "object"; whether "⚒ All tools" should be reachable on a bare screen.
