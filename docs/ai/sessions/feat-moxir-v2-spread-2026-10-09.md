## 2026-10-09 — MOXIR v2: the stage lit, the truss count, the lasers in (after the owner's look at B tuned)

Branch `feat/moxir-v2-spread-2026-10-09`, cut from `feat/moxir-v2-true-look-2026-10-09` (draft PR #853), stacks on it.
Scratch only (tree stack `moxir-v2-spread`, seeded from the `moxir-v2` scratch copy with `sqlite3 .backup`); never dev,
live or the owner's own di.

The owner on B tuned: "stage is totally dark", "you closed in one area", "check the lasers place on the other crane",
"how much light goes to truss?". At 17:4x he changed the plan: he paints the hall's areas himself and the lights get
placed from the audience's view positions, so the **spread into the audience half is ON HOLD**. Built here:

- **The stage from the front** (`scripts/place/moxir_v2_spread.py build`, rig
  `scripts/place/rigs/moxir-v2-stage-lasers-2026-10-09.json`): a McCandless key pair on the DJ. House left is a column
  bracket on the nave column x −12 z 12 at 6.0 m, 45° off his eye line. House right is a stand in the pit, 64° off.
  Two more PARs on the bracket light the speaker faces. The four come from the far end: the column pair at z −54 and
  the far wall's outer two. The computed light on the DJ's face goes from 0 to ~50 lx; the lux probe reading is in
  `~/Downloads/moxir/v2-spread/probe.json`.
- **The cut stays at 10 PARs** (cut-count.mjs's table): it hangs behind him and gives 0 lx on his face at 10 or 12.
  12 adds 9.8 kg on the middle pick, and with the 25° lens a third of the shafts merge.
- **The lasers** are the six cubes and the bar exactly as git cf954908 (PR #844). The crane travel to z −12 is the
  owner's decision. No unit enters a tube. The closest is cut PAR 08 under beam 4a: 0.11 m with an ASSUMED 0.25 m
  body sphere, tighter than the laser session's own 0.37 m.
- **Task 2 input only**: `moxir_v2_spread.py candidates` measures 78 places in the audience half (sky clear %, PAR on
  steel) → `~/Downloads/moxir/v2-spread/candidates.json`.

Owed: the owner's painted plan (task 2); the column bracket and the pit stand (the venue's OK, the rigger's check);
the room's PAR candela (30 478 cd) vs the spec figure (11 000 cd, 2.77×), to be measured on a unit; the crane's
on-site move, inspection and lock-out; hall v10 with the crane at z −12.
