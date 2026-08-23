## 2026-08-24 — deleting asks first, and says whose work it is

- Delete/Backspace took any selected object with no confirm and no ownership check,
  across all four paths (`useEditorShortcuts`, `StudioEditor`, `RawGraphSurface` for
  nodes, `RawEditor` for objects). Undo is per-client, so the person whose work
  vanished had nothing to undo — only an admin rollback of the WHOLE space to the last
  daily snapshot, which costs everyone else their day to undo one accident. Now every
  path asks first.
- A hard ownership *block* was not buildable: nothing in a document carried an author.
  So one was added — `createdBy` stamped at `createEntityOfType` (the single
  add-an-entity funnel) and at `createNode` (`nodeRegistry`, sole node constructor,
  all nine call sites checked). The confirm escalates to name the author instead of
  blocking, because a block on the unowned content that already exists would gate
  nothing.
- **The trap:** `normalizeEntity` and `normalizeProjectNode` both return a fixed
  literal, so a field added only at the funnel is silently dropped on every op apply
  and every document load — the op-log would have carried an author the rebuilt
  document did not have. `createdBy` therefore had to go into both schema mirrors
  (`src/shared/projectSchema.js` and `shared/projectSchema.cjs`), guarded by a new
  `schemaSync.test.js` case. No document-version bump: it normalizes to `null` for
  everything older, and `updateEntity` preserves it — editing someone's object is not
  taking it over.
- Compared on `author.subject`, never `author.label` — a label is a name a person can
  change. Missing author reads as UNOWNED, never as "yours".
- No generic confirm component existed; the convention for destructive actions was
  `window.confirm` at 14 sites. New `ConfirmDeleteDialog` follows the existing
  Raw/Studio help-dialog chrome, square-edged `--di-*` tokens, buttons 44px tall and
  bottom-docked so they land in thumb reach on a phone. Nothing existing was restyled.
- Three tests that fired Delete and expected an immediate delete were rewritten to go
  through the confirm rather than weakened. The 2026-07-17 decision they encoded is
  preserved: Node 0 gets the *same* question as any node, never an extra one, and
  `window.confirm` is still asserted never to be called.
- Still undone, and it is the check that matters most: this has not been exercised in a
  running session against a real server, or on the `dilijan` staging space as an actual
  guest — the weakest session that has to work, and the one the camp depends on.
- Not stamped: `src/project/jam/jamObject.js` and `importLegacyScene.js` (which bypasses
  the funnel via `normalizeEntity` at six sites). Both outside the camp's surfaces;
  what they make reads as unowned, which is the safe direction.
