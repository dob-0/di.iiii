## 2026-10-21 — Link waits on the URL/tree addressing spec, and a test now holds that gate

- Asked to build a Link node (one project to another, frame-safe), one of the 12 Raw
  features from the works audit. Its own first step: check whether
  `docs/architecture/SPEC_url_architecture_and_tree_addressing.md` is signed off. It is
  not — Status line reads "DRAFT — plan only, no code", §7 says "still unsigned", and
  the 2026-08-04 recommendations carry no strike-through. So no node was built.
- New test in `src/project/nodeRegistry.test.js`: while that Status line contains DRAFT,
  `universe.link` stays unimplemented and no offered type is called Link or ends in
  `.link`. Shown to fail once (removed `universe.link` from `UNIMPLEMENTED_NODE_TYPES`:
  1 failed) and pass on the real registry (68/68).
- `docs/roadmaps/NODE_BACKLOG.md` keeps the measured need (11 projects hand-build the
  same frame-escaping snippet) and the agreed shape, so the build can start the day the
  spec is signed.
- Undone, and the owner's call: sign (or strike) §7 of the spec. Until then the eleven
  projects keep their pasted snippets.
