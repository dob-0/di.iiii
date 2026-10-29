## Empty rig pages offer the next step as a button (UX slice S22, finding F038)
- NextStep.jsx / nextStep.js: plain line + buttons on the empty cards (rental, positions, looks), plot (hall) and scenes pages; no script name in the page text.
- New actions in the app: "make a first look" (every lamp `point` at the stage centre, open white), "load looks from a rig file", "load the hall plan" (hall.json).
- rigLooksFrom / groupKeys / rigLooksOp moved to src/rigbuild/rigLooksFrom.js; scripts/rigbuild/looks.mjs imports and re-exports them (still runs: `node scripts/rigbuild/looks.mjs --rig …`).
- Kept: every script (looks.mjs, rental.mjs, load-plot.mjs, show-cues.mjs) runs as before; the old hint text lives in git (origin/dev fe77231ee).
- Not a server route (the plan's idea): the buttons send ops through the page's own op path, which already has undo, read-only and the server's write check.
- Tests: src/rigbuild/nextStep.test.jsx (16); rigbuild + styles + rig tools suites green. Seen: desktop + phone, dark, scratch stack (agent report S22/shots).
- Not done: the kit's rig card still has no try link ("Start a rig" needs a page that makes a project first).
