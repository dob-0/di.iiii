## Objects list shows what the scene shows (UX audit F026, slice S33)
- StructurePanel counts and lists standing nodes of the top room (`listRoomNodes`) beside the document entities; Geo rows open the Geo.
- Replaces: the count `entities.length` only. Kept: every entity row behaviour; the empty line still shows for an empty project (nothing removed).
- Tests: StructurePanel.test.jsx (3 new), geoScope.test.js (1 new); the 4 fail on the old code (run with the two source files stashed).
- Not done: selecting a non-Geo node in Studio outside a Geo; browser pictures (see the result file).
