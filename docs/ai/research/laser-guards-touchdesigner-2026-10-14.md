<!-- Landed 2026-10-14 (ledger N645.4) from agent report: laser-guards-touchdesigner.md (date 2026-10-14).
Source of facts: external repos/pages named in the body with URLs and commit SHAs; licences as recorded there.
Licence rule: GPL-3.0 code may be quoted briefly with attribution, never copied wholesale; no code from this note is in the product.
MEASURED vs CLAIMED: read by expanding the .toe with Derivative's toeexpand under Wine; owner's own use ('perfect works') is a claim, not a test.
UNVALIDATED: the repo has no LICENSE file (script header says MIT); not a safety reference, it has no protection.
Provenance: written by an agent, so a claim until re-checked at the cited commit. -->

# LaserCube from TouchDesigner — how NairoDorian/Laser-Cube-TouchDesigner protects the galvos (read 2026-10-14)

Source: https://github.com/NairoDorian/Laser-Cube-TouchDesigner tree 34ca8845 (pushed 2023-08-23). Repo has no LICENSE file;
the script header is MIT, (C) 2021 Dorian Picard, based on Sidney San Martín, mods Tim Greiser. Owner used it in TD: "perfect works".
Read by expanding TD_LASER_CUBE_WIFI_LAN_2022.toe with Derivative's toeexpand.exe (TD 2025 under Wine, td-soda prefix).

## The Python (LASER_CUBE_SCRIPT, SCRIPT, chopexec1) — a thin sender, NO protection
- Same UDP protocol as di: 0x77 info, 0x78, 0x80 output on, 0x8a buffer, 0xa9 data; ALSO 0x82 SET_RATE (sets the cube's DAC rate; di only reads it) and defines 0x8d CLEAR_RINGBUFFER (unused).
- 146 points per message (di: 140). Sends only while remote buffer free > 1000, else drops the message.
- Rate default 30000; README: 35 kpps OK on new cubes, "34500 … allows to not overload the buffer".
- No clamp in Python (packs ints '<HHHHH'), no jump limit, no watchdog, temperature only DISPLAYED.
- OFF button: only changes the panel colour/text; sends no output-off, no blank. The Laser CHOP goes inactive, so the stream just stops.

## The protection is TouchDesigner's built-in Laser CHOP (laser1.parm)
| parm | value in project | Derivative docs (https://docs.derivative.ca/Laser_CHOP) |
|---|---|---|
| stepsize | 0.015 | "distance each x,y can change while outputting color" (no unit given; TD's normalized space) |
| bstepsize | 0 | same while blanking; meaning of 0 not documented |
| minverthold / maxverthold (docs: corner hold) | 0.001 / 0.01 | min/max corner hold of a point, no unit given |
| preblankon / postblankon | 0.3 / 0.005 ms | wait before / after colour off |
| preblankoff / postblankoff | 1 / 0 ms | wait before / after colour on |
| starthold | 0 ms | wait at first point of a frame |
| rate | 30000 in and out | |
Then math CHOPs scale x,y to 0..4095 (gain 4095*0.5, offset) and r,g,b x4095, rounded.
Docs say nothing about galvo protection; only eye-safety warnings + e-stop advice.

## Verdict for di.iiii
Same answer as the other five projects: the path smoothing (max step per point, corner hold, blanking delays) is done on the HOST — here by TD's Laser CHOP. The cube is never trusted to protect itself. di has none of these yet (ledger N641).
Useful di extras from this script: 0x82 SET_RATE (set the rate explicitly instead of trusting the cube's current one); 34.5 kpps as a buffer-safe ceiling (owner-tested practice, unvalidated).
