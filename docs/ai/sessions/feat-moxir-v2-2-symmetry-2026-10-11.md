# feat/moxir-v2-2-symmetry — lights re-placed after the owner's example videos (2026-10-11)

Owner (2026-10-11): "i want to edit light places i sent examples make it like examples but dont make moving things on the
truss, but keep symmetry and organaize well". Ledger N501.3. Lead chat (info@), session
https://claude.ai/code/session_01P24eqDHfgsnvBSJtN3ezVa.

## What changed
- `scripts/place/moxir_v2_symmetry.py` — new. Reads the v2.1 rig and the zones, lays the moved parts out as mirror pairs
  about the DJ axis X0 = −5.2 (plane-1 laser fans, wing islands arching to the roof, side PAR rows on the paint edge,
  back columns, cubes, haze on the axis), keeps every fixture and id, and writes `scripts/place/rigs/moxir-v2-2-2026-10-11.json`.
  `--check-only` re-runs the checks; `--info-out <file>` writes the full checks info as JSON.
- `scripts/place/rigs/moxir-v2-2-2026-10-11.json` — the v2.2 rig: 75 fixtures, 63 moved, nothing moving on the truss
  (the 18 B380F heads are fixed-aim on the floor and the wing islands).

## Checks
- symmetry script: fails [] (worst beam-end mirror 0.06 m; plates follow the asymmetric paint, 8.4 m).
- `MOXIR_CRANES_RIG=scripts/place/rigs/moxir-v2-2-2026-10-11.json python3 -I -B scripts/place/moxir_v2_cranes.py check --repo .` → fails [].
- `npx vitest run scripts/place/moxir-v2-*.test.js` → 70 passed, 2 expected fail (ground suite = v2 ground layer, not v2.2).
- Loaded on the scratch stack as `moxir-v2-2` (slug `v2-2`, document version 168); backup of v2.1 first in
  `~/di-backups/moxir-scratch/2026-10-11-v2-2/`. Job record:
  `~/work/agent-reports-2026-10-09/moxir-lead/symmetry-2026-10-11/brief.md`.

## Limits
- Scratch only; nothing on dev or the owner's di until he has looked at `http://moxir-test.diiii.localhost/moxir/v2-2`.
- Motion looks do not apply to fixed-aim heads.
