## 2026-08-19 — the sheet can show the lines

The second half of "what is it made of": where a node is worked out or drawn, the
sheet now names the file and the exact lines, and "Show the lines" opens them —
real, unedited, fetched lazily, and refused outright rather than ever shown wrong.
This is the owner's original sentence — "it can be what code is the cube" — kept
honest by machinery instead of by promises.

- **The manifest is measured, never written.** `scripts/sync-node-anatomy.mjs`
  parses the three places code lives — `computeNodeOutput`'s switch, `renderNodeBody`'s
  switch, and `renderViewNodeContent`'s if-chain, which no `case`-shaped scan can see —
  with acorn, and emits `src/project/graph/nodeAnatomy.generated.js`: per type, line
  ranges, fall-through groups as structural fact, and which ports each case answers.
  The repo's first generated file under `src/`; same sync/check contract as
  `sync-agent-docs.mjs`, CI-gated by `npm run check:node-anatomy`.
- **AST, not regex, because regex was tried and lied three ways** (measured during
  design): a fall-through case came back as a bare label with no body, a section
  header comment got glued to the wrong node, and the editor's if-chain was invisible
  entirely. `scripts/nodeAnatomy.test.js` holds ten SEMANTIC assertions — no empty
  slice, no trailing comment, no foreign label, full 64-type coverage both ways,
  answers ⊆ declared outputs, fingerprints match disk — because round-trip
  determinism alone would freeze a buggy extractor's wrong output forever.
- **Live-fed agreement, by two independent means.** The text scan of each slice for
  `liveOutputs` must equal the Symbol-substitution probe's verdict on a real node,
  type by type. The day a live case lands without the sheet learning of it, CI goes red.
- **The browser slices by line range only** (`nodeSourceSlices.js`): an explicit
  two-file `?raw` thunk map (runtime 5.0 kB gz + viewport 7.0 kB gz, own lazy chunks,
  paid only on first press), a shared djb2 fingerprint (`sourceFingerprint.js`, one
  function imported by build and browser so they cannot drift — and over the JS
  string, not bytes: the em-dashes in this codebase's comments make byte offsets and
  string offsets disagree silently). Mismatch → a visible refusal, watched red with
  the guard removed. `RawEditor.jsx` is deliberately NOT fetchable — ~23 kB gz for a
  five-line branch — so panel types get a location row without a quote.
- Containers get the doorway lines every one of them shares (the pre-switch block
  that answers a promoted socket before the type is even consulted); the five value
  nodes say "one piece answers for 5 — read it and you have read all 5"; `time`
  carries the single hand-kept extra place (`useGraphClock.js`), itself guarded by a
  test asserting the symbol still lives in the named file.
- `acorn`/`acorn-jsx` promoted from transitive to declared devDependencies — a clean
  `npm ci` would otherwise break the sync script with no warning. Lock updated with
  exactly those two lines (the full `npm install` regeneration also wanted to strip
  `libc` fields — npm-version churn, kept out).

### Verified

Seen at 1440×900 and 390×664: the cube's real five-line runtime case and its real
two-line draw return, quoted verbatim (asserted against the file on disk, not against
DOM presence), scrolling sideways inside their own boxes with no horizontal page
scroll; the container's doorway lines; the unbuilt type showing a banner and no
location rows. The fingerprint refusal exercised against the REAL loader with a
corrupted expectation — nothing mocked anywhere in the new tests.

Branch stacked on feat/raw-node-anatomy (PR #171); rebase onto dev after it lands.
