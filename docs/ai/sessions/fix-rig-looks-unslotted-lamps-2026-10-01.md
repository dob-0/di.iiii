## 2026-10-01 — A lamp no derived slot holds is placed by the position its fixture names

- Found on MOXIR (PONYO): every beam look stayed dark on the desk and in the room. Floor movers standing near, not on, a column base or behind the press sat on no derived slot (positionsOf), so lookPoses never posed them and deskLooksWithValues wrote them dark (Known · full: 0 of 17 UP-B380F in any look; Known: 7 of 13).
- `src/rigbuild/looks.js` lookPoses: a lamp no slot holds is placed by the mount its `fixture.position` words name. The table is `src/rigbuild/mountPosition.js`, shared with the generator (scripts/rigbuild/looks.mjs re-exports it), so the two cannot drift. "booth back" (stage-back or stage-flanks) is never guessed.
- Guard: looks.test "places a lamp no derived slot holds…" (red on the old code).
