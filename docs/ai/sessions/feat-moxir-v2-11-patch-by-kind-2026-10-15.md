## 2026-10-15 22:2x — MOXIR v2.11: the patch by kind (U1 the beams, U2 the washes, the 40 W lasers, the haze)

Owner: "with the patching let's in one universe make the beam, the other the washes and the lasers" (22:2x); the washes he moved
himself in the plot ("i changed already", 22:3x — 12 side beams and 13 washes differ from the 18:0x rig file; dev and his di hold the same document).

**Measured before (his di, document v14, desk GET /light/api/rig):** the document had the 18 B380F on U1 and the 40 PL5403 on U2, the two
UP-LA40WF and the haze OFF DMX (unpatched, the plot's two "unpatched" diamonds); the desk held 241 fixtures of SEVEN September versions
(moxir-hall-minimal, -halo, -full-ground, -minimal-ground, three -oldhall-0929) and NOT ONE of v2.11 — 58 v2.11 lamps sat on addresses those
versions hold, which the plot reports as "! 32 conflicts". The 10-15 18:1x "47 not where planned" was the same thing: desk ≠ document.

**The plan** `scripts/place/rigs/moxir-v2-11-by-kind.patch.json`: U1 port A = the 18 beams (001–273, fixtures 101–118); U2 port B = the 40 washes
(001–313, 201–240, by unit id), the two lasers (401, 433; 251–252), the haze (501; 261). Fit: U1 288/512, U2 385/512. Dry run against his di:
61 ops, 0 errors, 3 warnings (the lasers and haze come onto DMX). 29 washes change address (the old numbers were the v2.1 plan's with gaps
from removed units); circuits kept (`--keep-circuits`). Undo = the one op batch.

**Apply** (`~/di-backups/moxir-patch-by-kind-2026-10-15/apply.sh`): backup → plan into the document → the seven old versions off the desk
(`patch.mjs --unpatch`) → `patch.mjs --exact` → check → the sheet + the plot in his browser. The auto-mode classifier refused the write to his
live document and desk from the chat ([Modify Shared Resources]); he runs the script once.
Not done here: the physics check after his moves (owed with the apply); the crew sheet print (the script writes it).
