# physics_check --fix 400 and the line-42 leak (2026-10-15)

## What
`physics_check.py --fix` skipped laser lines, so a project whose only leak is a laser posted an empty ops batch (HTTP 400 "No operations provided."). It now fixes every leak, lasers included (`fix_ops`), with a unit test. moxir-v2-11 on moxir-one: rig-laser-42 length 69.72 → 60.02 m (v1774 → v1775), 0 leaks; backup `agent-reports-2026-10-15/moxir-50/backup/v2-11-before-leak42.json`.

## Tested / not tested
Tested: unit test (3), scratch stack repro + fix (1 leak → 0), real project read-back. Not tested: a look in the room (heat gate, no browser started).
