# fix/structure-writes-edits

## Page tools save as edits, so a follow carries them (N1282)

- 2026-10-25: twice in one night a Dilijan apply-structure run on dev stopped the own di's follow ("one side replaced the
  whole work"), until `di follow --take-host`. The tools saved a page with PUT /document = a `replaceDocument` op, and a
  follow refuses whole replaces by design (serverXR follow/followPlan.js). Owner's pick: route b, the tools write edits;
  the follow's rule is unchanged.
- `scripts/space/pages-lib.mjs` `documentEdits(before, after)`: createEntity (an upsert) / deleteEntity (children it takes
  that stay are made again) / upsertAsset / deleteAsset / setPresentationState / setWorldState. Any other changed field is
  named and the save refused, never dropped. `saveDocument(call, id, after, { from })` posts them to /ops at the version the
  tool read: an edit made in between is a 409, never undone. apply-structure keeps an untouched copy of what it read
  (its steps change the read document in place).
- Used by apply-structure, combine-pages (incl. --undo) and refresh-combined-tab; no tool in scripts/space PUTs a document now.
- Tests: pages-lib.edits.test.mjs (6, ops applied with the platform's own applyProjectOps); the fakes take /ops;
  scripts/space 53 passed. followIntegration "a page tool's save on the host reaches this install" on two real servers:
  passes; the same test with the old PUT fails (15 s, never arrives).
