## 2026-11-11 — Deck round 3: one install branch for the show tree

- In the branch: the K2 controller window with the K2 (1.9) button rows top-down and the hidden-deck fix; draggable borders between the deck panels with the unmount, window-resize and touch fixes; an on/off switch per source with the video-stream release fix; ways back to the VJ deck from Studio and the node view; the wiki help line about a camera with no picture.
- Merge order: K2 window, borders, source switch, ways. The help-line commit was already inside the ways branch, so cherry-picking it gave an empty change and it was skipped.
- Conflicts: src/wiki/wikiContent.js (twice) and docs/ai/known-fixes.md (twice). Both sides kept: the K2 window line, the newer TWO K2 CONSOLES line, the newer RESIZE THE DECK line, and the SOURCE SWITCH line; all known-fixes entries kept. The session notes of the pieces did not conflict. VjDeckView.jsx merged without a conflict.
- Tested: the whole unit suite and one build on this branch (results in the job report).
- Not tested: nothing seen in a browser, on a touch screen, or on the real K2.

## 2026-11-12 — K2 window fit
- Fixed: pad labels cut at the sides (face redrawn squatter, label inside a 31 x 22 pad), face taller than the screen (window asks screen.availHeight minus 60; text 12.4 px at 440 x 860 and 853 x 860), dev strip over the readout (gap under the readout in this window only).
- Tested: K2 and deck tests in src/perform/midi and src/raw/components/vjDeck (summary in the job report); seen in a browser at 440x860, 853x860, 360x700, preset K2 and K2 (1.9): no page scroll, 0 label clashes. At 360x700 the text is 9.6 px (the screen is too small for 12 px).
- Not tested: the real K2, a real tiling window manager, the owner's own screen.
- Second pass on the K2 window: fader caps no longer cover the first label line (cap now in the fader box, one-line fader and pad labels, "LN" for "Layer N"), and each encoder's press job is set apart from its turn job (half a line of gap and the dim ink).
- Seen at 440x860, 853x860, 360x700, K2 and K2 (1.9): 0 labels covered with the faders at both ends (end positions set in the page by moving the cap, not by a real fader), smallest label gap 2.9 px, text 12.3 px, no page scroll.

## 2026-11-12 — Deck line onto dev (pull request #1275, draft)
- Merge 1: dev had one commit this branch lacked, c9c908e63 (#1268), a squash of 57 commits that are all in this branch. Its tree equals ef7055a43, an ancestor of this branch, so a plain merge reports 31 conflicted paths that are the same work on both sides (KitPage, MapOutput, MapSourceView, WikiPage and wikiContent, the perform/midi files, the tops files, RawEditor, the vjDeck view, panel and css, their tests, the allNodes example, feat-vj-resolume-layout.md). Resolved as one merge commit that takes the branch tree (`-s ours`); no file of dev is deleted and no known-fixes line removed.
- Merge 2: dev moved by one commit (#1272, the 2 GB dev upload). One conflict, docs/ai/known-fixes.md (append-only): both entries kept.
- CI fix (caused by this branch): raw/rawTestScope.test.js failed because src/map/MapSourceView.sourceOff.test.jsx was not in the test:raw list; added `map/MapSourceView.sourceOff` to package.json.
- CI on the final head: build-and-test, checks, browser-checks, test shards 1 to 3, node-22-compat: all pass.
- Not run locally: the lane gate stayed closed (exit 2), so no local test run; CI was the runner.
