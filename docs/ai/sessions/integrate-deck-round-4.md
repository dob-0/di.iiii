# integrate/deck-round-4

What the branch holds: base 585240f61 + merge of feat/deck-ui-4-panes (e63700a03) + merge of feat/deck-ui-4-perform (3323d0793).
Only conflict: docs/ai/known-fixes.md (both appended an entry at the end); both entries kept, order panes then perform. src/wiki/wikiContent.js merged without conflict.
The two builders' changes touch different files (deck panes in src/raw/components/vjDeck, Perform in src/perform); no code conflict.

Also added: scripts/deck-round-4-walk.mjs (walk for widths, hit zones, fold, reset, lock, Perform arrange). It was written but NEVER RUN.

Install facts (run): base 585240f61 is an ancestor of HEAD; 21 files changed against it; package.json, package-lock.json, serverXR/package.json unchanged (0 matches).

Tested: nothing. The lane gate (scripts at platina/tools/lane_gate.sh) answered "wait" 12 times in 12 minutes (output 26.8 to 42 fps, floor 55-60); the 12-ask limit is spent, so no vitest run and no browser run was made.
Not tested: all new tests of both builders (deckPanes.test.js, VjDeckView.panes.test.jsx, arrangeAll.test.js, arrangementStore.test.js, PerformArrangement.test.jsx), the existing vjDeck, perform and wiki suites, and every look in a browser.
Brand: no visual change made in this branch beyond the builders' own (their notes list their brand lines).

## 2026-11-12 — one install line: deck UI round 4, the light line joined, a column fires its light cue

Three merge commits on top of the batch 4 line, in this order (no rebase, no squash):

- Merge of origin/integrate/deck-round-3 (dev merged into the deck line): no conflict.
- Merge of integrate/platina-show (lamps, looks, cues, 3D room with Show and Tech views, a walk script never run): one conflict, docs/ai/known-fixes.md (both sides appended at the end). Both entries kept: the batch 4 entry first, then the LED bar entry.
- Merge of feat/deck-column-cue (a column launch fires the light cue stored for that column; the switch Lights follow is off by default): no textual conflict although VjDeckView.jsx, vjDeck.css and wikiContent.js changed on both sides; git merged them by hunk. Read as a whole: the fold and lock controls (deckLayout, foldValue, Lock layout) and the Lights follow switch (lightsFollow, cueStatus) use different names; a Babel parse of VjDeckView.jsx and RawEditor.jsx finds no duplicate declaration.

Checked locally: no conflict marker in any file changed against the base (grep, 0 lines); esbuild parse of the resolved and merged source files passes; `npm run start-check` ran to its end (it reports code matches dev and lists branches that exist only on this machine).

Not tested yet: no look in a browser, the walk scripts (deck-round-4-walk.mjs and the platina one) were never run, no real controller, no real light desk. CI result per check is appended below once it has run.

### Pull request, CI and the fixes (2026-11-12)

- Pull request 1277 (draft, base dev). It sits on the deck line pull request 1275. At first no CI started: dev had moved and conflicted in docs/ai/known-fixes.md (append-only), so GitHub ran no pull_request workflow. A fourth merge, origin/dev into this branch, kept both entries; CI then started.
- First CI run: browser-checks passed; checks, node-22-compat and all three test shards failed on 6 test files. Cause per file:
  - arrangementStore.test.js (batch 4): clampRect trimmed the width through normalizePerformRect instead of shifting the window back; fixed in arrangementStore.js.
  - PerformArrangement.test.jsx (batch 4): the test read left/top, but DesktopWindow places a window with a transform; the test was fixed.
  - deckLayout.test.js (batch 4): the bottom row now stacks at 683 px, so the old 650 px case shows no seam; the test was updated.
  - surfaceBar.embed.test.jsx (column cue): RawEditor now reads useMapApi and the mock of useMapDocument lacked it; the mock was extended.
  - rawTestScope.test.js (source switch line): map/MapSourceView.sourceOff.test.jsx was outside the test:raw filters; one filter added in package.json.
  - copyVocabulary.test.js (batch 4 and column cue wiki text): two uses of the word room in the deck wiki text; reworded.
- Second CI run on the fix commits: browser-checks, build-and-test, checks, test shards 1/3, 2/3 and 3/3, and node-22-compat all passed (node-22-compat took about 16 minutes; the first run hit its 15 minute limit).
- The fixes were made without a local test run: the lane gate answered stop (exit 2), so CI was the only runner.

Not done: no look in a browser, the walk scripts were never run, no real controller, no real light desk; feat/deck-wall-live is not in this line.
