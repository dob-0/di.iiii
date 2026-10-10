## 2026-10-09 — MOXIR v2 B spread: the stage lit, the truss count, the lasers in, every light in the owner's hot zone

Branch `feat/moxir-v2-spread-2026-10-09`, cut from `feat/moxir-v2-true-look-2026-10-09` (draft PR #853), stacks on it.
Cherry-picked: the owner's zones (465b57e7: read_paint.py + rigs/moxir-v2-zones-2026-10-09.json) and the 7.5 W cubes
(dfc7929f). Scratch only (tree stack `moxir-v2-spread`, seeded from the `moxir-v2` scratch copy with `sqlite3 .backup`;
room `moxir-v2-stage-lasers`); never dev, live or the owner's own di.

The owner on B tuned: "stage is totally dark", "you closed in one area", "check the lasers place on the other crane",
"how much light goes to truss?". At 17:42 he painted the hall's areas: a hot zone (people + light, x −30..25, z −31..44),
two wings, a bar and a chill + food area, and asked for the lights to be placed from the audience's view positions.

- **Rig**: `scripts/place/rigs/moxir-v2-spread-2026-10-09.json`, written by `scripts/place/moxir_v2_spread.py build`
  (placement in `moxir_v2_eyes.py`; `--placement` reuses a run's placement, the search takes ~25 min on one core).
  B tuned stays untouched as the labelled old version.
- **The stage**: a McCandless key pair on the DJ: a column bracket on the nave column x −12 z 12 at 6.0 m, and a stand
  in the pit. Two more PARs on the bracket light the speaker faces. Computed: DJ face 0 → ~50 lx; the probe reading
  is in `~/Downloads/moxir/v2-spread/probe.json`.
- **The cut stays at 10 PARs**: it hangs behind him and gives 0 lx on his face at 10 or 12. 12 adds 9.8 kg on the
  middle pick, and with the 25° lens a third of the shafts merge.
- **The lasers** are the six cubes and the bar exactly as git cf954908 (PR #844). The crane travel to z −12 is the
  owner's decision. No unit enters a tube. The closest is cut PAR 08 under 4a: 0.11 m with an ASSUMED 0.25 m body
  sphere. The lines now carry the 7.5 W cube's flux per beam (epic-build `laserBeamLumens`, from `variant_in_use`);
  the old fixed 254 / 72 lm was v1.0's two scanned 6 W beams.
- **The hot zone**: people on all sides of the stage, so every beam is checked over the whole floor. 26 PARs and
  12 B380F were re-placed onto out-of-reach column brackets in both wings and behind the stage, scored from 8 eyes.
  Units outside the hot zone: 27 → 0. Read against the hot zone, B tuned had 6 floor heads among people and 9 beams
  someone looks down within 30°; the spread has 0 and 0.

- **Measured in the room:** the lux probe reads 0 → ~44 lx on the DJ's face in both looks. The room SQUARES a look's level
  (the renderer's lamp list: intensity = nominal × level²; the second factor is not found: owed to the viewport), so the
  faders are set for the room. White-out from the floor at the peak is 0.88 %; the lamps alone are 0.52 % (budget 0.65 %)
  and the 7.5 W laser lines add the rest. The DJ sees a veil: the keys light the haze around him.
- **Fixed:** a frames or probe run killed by `timeout` left its tab drawing the room (close-on-signal.cjs, known-fixes).
  Laser lines now carry the 7.5 W cube's flux per beam.

Owed: the viewport's level² factor; the DJ's veil and the lasers' glare share (the owner's call); the column brackets and the pit stand
(the venue's OK, the rigger's check); the stage pen's barrier; guard cages for the floor PARs at the stage columns;
the room's PAR candela (30 478 cd) vs the spec figure (11 000 cd); the crane's on-site move, inspection and lock-out;
hall v10 with the crane at z −12.
