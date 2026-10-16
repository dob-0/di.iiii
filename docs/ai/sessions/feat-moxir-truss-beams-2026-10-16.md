# MOXIR — two side beams onto the truss, hung, shining down (2026-10-16 17:3x–17:5x)
**Asked:** "2 beams from left right goes to the truss … 5, 5 left right six behind dj and 2 from truss" (screenshot 173106: pink marks at the truss's two ends); then "they look to down".
**Done on the show (moxir-v2-11):** rig-beam-planes-10 (side line left, z 9.27) → truss left end [-10.55, 2.686, 3.312]; rig-beam-planes-07 (side line right, z 9.27) → truss right end
[0.0, 5.515, 3.312]; both `fixture.hung = true`, rotation [0,0,0]. Every look's "vertical" rule then points them DOWN (lookRules.js upOf). Written on the owner's di v82→v86 with
`move_lamps.py --apply` (backup ~/di-backups/moxir-truss-beams-2026-10-16-local/document.json); `di follow` carried it to dev (v86 in ~10 s). Physics check: 2 leaks (old 12.61 m length
through the floor) → `--fix` → 0 leaks of 96 beams at v88; dev v88 holds the lengths 2.69 / 5.51 m.
**Tool:** `move_lamps.py` takes `"fixture": {...}` per move (merged in the same batch, read back), sends a User-Agent (Cloudflare 403'd Python's), reads the token like api.mjs.
Moves file with provenance: `scripts/place/rigs/moxir-v2-11-truss-beams-2026-10-16.moves.json`. **Picked by the agent:** which side beams (the two nearest the truss); the hang 0.515 m below the axis.
**Not done:** addresses unchanged (U1@145 and U1@97 in the document; the ESP wiring has the truss beams at 1 and 97 — patch recheck N870 open); dev's API refused the local key (401) — dev was reached through the follow.
**Undo:** move_lamps.py with the positions from the backup (side lines at z 9.27, rotation [π,0,0], hung false).
