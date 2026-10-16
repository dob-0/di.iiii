## 2026-10-15 — land the MOXIR show branch on dev (through PRs #979, #988, #989)

- Merge of `feat/moxir-v2-10-forty-2026-10-15` at 94dfe77d into `dev` at 4f3bec9b: heads motion, the Cut switch, the room page standing whole (Cut off by default, #979), the lasers diagnosis and the two 40 W lasers (#988), `physics_check --fix` for laser leaks (#989), the devices charts (#978), the light environment the owner took for v2.11.
- One add/add conflict, `scripts/place/rigs/moxir-scenes-50-2026-10-15.json`: the show branch's version (17:57, the 40 W lines in every laser scene) wins over dev's 14:52 copy.
- Why: the owner's "fine now i want to last on dev" (2026-10-15, ledger N842). The v2-11 projects (and red, arcs) were copied to dev by the push-to-dev executor at 17:04; after this landing they are copied once more so dev shows the owner's newest light pick.
- Not tested here beyond the push gate (lint, schema-sync tests, docs checks): CI on the PR runs the rest. Try after the dev deploy: `https://dev.diiii.xyz/moxir/p/moxir-v2-11`.
