## 2026-08-20 — the anatomy manifest is measured, not committed

- `nodeAnatomy.generated.js` is gone. It was keyed by line number, so it changed
  whenever any of the three files it measures changed, and it rode along in 10 of 13
  Raw wave diffs as a pure conflict — never a reviewed line, always a rebase to redo.
- The velocity plan offered "re-key to stable anchors, or regen post-merge in CI".
  Neither survives contact: any stable anchor still has to resolve to line ranges
  somewhere, and the browser is deliberately forbidden from pattern-matching source.
  So the measurement moved instead of the keys — `virtual:node-anatomy`, a vite plugin
  over the same acorn extractor, run during the build that ships the code.
- Manifest and source are now the same revision by construction, so the whole staleness
  class is gone and with it `check:node-anatomy` (off the PR gate) and
  `docs:anatomy:sync` (off the add-a-node checklist). The dev server re-measures on
  change to a measured file, so a long-running editor cannot drift either.
- The extractor's semantic guards all stay — a build-time extractor with a bug is
  exactly as wrong as a committed one. Only the round-trip freshness assertion went;
  in its place, one that the manifest names no file outside `MEASURED_FILES`.
- **Removing the check did not shorten the gate** (4m48s on this PR, against ~4m41s
  measured before). The un-sliced vitest run is the whole cost, so `test:raw` is the
  lane-2 item that actually buys time. This one buys rebases.
- Seen, not inferred: `/raw` → inside Cube → "What it's made of" → "Show the lines"
  quotes `nodeGraphRuntime.js` 203–221, the real `geom.cube` case. Re-checked after the
  rebase, which also proved the point — the branch conflicted within the hour, on
  exactly the file it deletes, because two Raw PRs regenerated it.
- Carried across from #215, which landed real work into the file this branch deletes:
  colocated runtimes (`src/project/nodes/<typeId>/runtime.js`) are a manifest source, so
  `buildManifest` discovers and fingerprints them alongside the trio. The watch list
  became a predicate (`isMeasuredFile`) rather than a list — migrating a type out of the
  switch CREATES its runtime file, and a list built at server startup is blind to exactly
  the file that just appeared, so the dev server now re-measures on `add` too. Seen:
  inside Video, the sheet quotes `runtime.js` 1–8, the whole colocated module.
- **Land this promptly.** It conflicts with every wave that touches what it deletes —
  three times in one afternoon (#207/#208, #213/#214, then #215). The first two were the
  generated file and resolved with one `git rm`; the third was a real change to carry.
  Worth knowing while it waits: GitHub
  queues no `pull_request` CI run while a PR is conflicting, so a stale branch here reads
  as "no checks yet" rather than as a conflict, and polling for CI never resolves.
- Still open in this lane: the `test:raw` script and widening the `authoringOnly`
  staleness guard, which is still blind to viewport/window-only implementations.
