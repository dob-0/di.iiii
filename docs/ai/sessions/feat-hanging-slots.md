## 2026-09-03 — build zones: a room that arranges itself

The owner, after the Open Jam room came back from one night with thirty phones in
it: *"some logic where someone will add something and it will not mess again and
it will be arranged … like in games, where you can build and where you can't."*
Restated and approved with his two answers: a **platform feature with a per-room
switch**, and **the server places it** rather than the editor snapping.

- `worldState.placement` turns a room's build zones on. Absent means free space,
  the historical behaviour, and switching it off leaves every photo where it
  hangs — a switch, never a migration.
- The slots are a **formula, not a stored list**: `slotAt(layout, i)` deals i
  round-robin across back wall and two wings, rows alternating, columns spreading
  outward from the centre. Slot 200 exists as surely as slot 1, so the wall grows
  outward and a jam never runs out. Occupancy is read back from where entities
  actually stand, so it is self-healing — delete a photo and its slot is free.
- Every incoming op batch passes through `placeOps` in `projectRoutes` BEFORE it
  is versioned, so the rewritten ops are what enter the log and reach every peer.
  That is what makes it a rule rather than a suggestion: a phone, a script and a
  signed-in author all land on the same hanging line.
- A drag goes to the NEAREST free slot. The hand still chooses where on the wall,
  just not "nowhere".
- `components.placement.pinned` opts a thing out — the QR on its lectern is
  furniture, not an exhibit for the wall to swallow.
- Uploads now record the picture's proportions (EXIF orientation applied), which
  is what lets a 3.3:1 banner be scaled into its slot instead of eating its
  neighbours. Assets uploaded before this keep the row height.
- `shared/placement.cjs` and `src/shared/placement.js` are hand-kept twins, server
  and editor, with a test that fails if they ever disagree — the same convention
  the project schema's twins use.

Checked through the wire, not only in units: a contract test posts a photo asking
for the origin and asserts it does not get one there.
