## Objects list shows what the scene shows (UX audit F026, slice S33)
- StructurePanel counts and lists standing nodes of the top room (`listRoomNodes`) beside the document entities; Geo rows open the Geo.
- Replaces: the count `entities.length` only. Kept: every entity row behaviour; the empty line still shows for an empty project (nothing removed).
- Tests: StructurePanel.test.jsx (3 new), geoScope.test.js (1 new); the 4 fail on the old code (run with the two source files restored from origin/dev by `git show`, then put back).
- Not done: selecting a non-Geo node in Studio outside a Geo; browser pictures (see the result file).
- Review (S33 judge): node rows are listed only where Studio draws them (not in a jam project, where graphRoom is null).
- Fix round 2: each non-Geo row has a visible "Edit in Nodes" button (opens Nodes for the project; Nodes has no per-node link); the marked top-room Camera is no longer listed (matches GraphRoomNodes.jsx:56-64). Top room stays not selectable in Studio (named, not done).
