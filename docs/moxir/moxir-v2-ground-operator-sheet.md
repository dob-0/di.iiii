# MOXIR v2 ground: B380F operator setup sheet (desk limits)

Written by `scripts/place/moxir_v2_ground.py build` from `scripts/place/rigs/moxir-v2-ground-2026-10-09.json` (2026-10-09). **No desk enforces these numbers yet: set them by hand as position limits (pan / tilt min-max) on the show desk, per head, before the first focus. Enforcing them in di's desk is OWED code** (rigPatch carries no limits; fine channels pass through; raw overrides bypass the limits: serverXR/src/lighting/engine.js).

- Channels (the 16-channel map TESTED on the Sevan units, channels 1-10): ch 1 pan, ch 2 tilt, ch 3 pan fine, ch 4 tilt fine (the head's address + 0..3).
- 16-bit value = coarse x 256 + fine. Centre 32768 (coarse 128, fine 0) = HOME = the beam straight up out of the base (dmxDecode.js); 540 deg pan / 270 deg tilt (the maker's range, EXACT).
- **ASSUMED until the channel walk** (docs/moxir/b380f-16ch-map-check-2026-10-09.md): that centre is home, that pan grows clockwise seen from above, and that tilt grows TOWARD the base's front. Each base is set down with its front facing the azimuth in the table. **A reversed tilt points the window backwards**: at the focus call, send each head to its aim (tilt high value) with the lamp OFF, check by eye that it points where the table says, then set the limits.
- Tilt is degrees from home (0 = straight up); the window's low edge is the aim (the head never tilts lower than its aim: that is the safety edge), the high edge up to 15 deg more vertical.
- Power trip / reset / DMX loss behaviour of the B380F is UNKNOWN (no manual). Crew line: restore a tripped B380F circuit only with the lamp channel off and the shutter closed on the desk; nobody stands in front of a floor head during its reset sweep.

| head | fix # | address | DMX line | where | base front faces (az) | pan from home (deg) | tilt from home (deg) | world az | world el | pan 16-bit (coarse/fine) | tilt 16-bit (coarse/fine) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| rig-beam-planes-01 | 101 | U1.001 (ch 1-4) | NODE-STAGE-A | stage pen (x -7.2, z -5.0) | 330.0 | -10.0..+10.0 | 24.5..39.5 | 320.0..340.0 | 50.5..65.5 | 31554..33981 (123/66..132/189) | 38714..42355 (151/58..165/115) |
| rig-beam-planes-02 | 102 | U1.017 (ch 17-20) | NODE-STAGE-A | stage pen (x -6.2, z -5.0) | 333.0 | -10.0..+10.0 | 12.5..27.5 | 323.0..343.0 | 62.5..77.5 | 31554..33981 (123/66..132/189) | 35802..39442 (139/218..154/18) |
| rig-beam-planes-03 | 103 | U1.033 (ch 33-36) | NODE-STAGE-A | stage pen (x -5.2, z -5.0) | 330.0 | -10.0..+10.0 | 3.0..18.0 | 320.0..340.0 | 72.0..87.0 | 31554..33981 (123/66..132/189) | 33496..37136 (130/216..145/16) |
| rig-beam-planes-04 | 104 | U1.049 (ch 49-52) | NODE-STAGE-A | stage pen (x -4.2, z -5.0) | 20.0 | -10.0..+10.0 | 3.0..18.0 | 10.0..30.0 | 72.0..87.0 | 31554..33981 (123/66..132/189) | 33496..37136 (130/216..145/16) |
| rig-beam-planes-05 | 105 | U1.065 (ch 65-68) | NODE-STAGE-A | stage pen (x -3.2, z -5.0) | 25.0 | -10.0..+10.0 | 17.0..32.0 | 15.0..35.0 | 58.0..73.0 | 31554..33981 (123/66..132/189) | 36894..40535 (144/30..158/87) |
| rig-beam-planes-06 | 106 | U1.081 (ch 81-84) | NODE-STAGE-A | stage pen (x -2.2, z -5.0) | 32.0 | -9.5..+10.0 | 26.0..41.0 | 22.5..42.0 | 49.0..64.0 | 31615..33981 (123/127..132/189) | 39078..42719 (152/166..166/223) |
| rig-beam-planes-07 | 107 | U1.097 (ch 97-100) | NODE-FAR-A | far end (x -26.5, z -37.9) | 9.0 | -10.0..+10.0 | 36.5..51.5 | 359.0..19.0 | 38.5..53.5 | 31554..33981 (123/66..132/189) | 41618..45259 (162/146..176/203) |
| rig-beam-planes-08 | 108 | U1.113 (ch 113-116) | NODE-FAR-A | far end (x -35.5, z -31.9) | 33.0 | -10.0..+10.0 | 36.5..51.5 | 23.0..43.0 | 38.5..53.5 | 31554..33981 (123/66..132/189) | 41618..45259 (162/146..176/203) |
| rig-beam-planes-09 | 109 | U1.129 (ch 129-132) | NODE-RIGHT-A | house right (x 30.5, z -22.9) | 15.0 | -10.0..+10.0 | 40.0..55.0 | 5.0..25.0 | 35.0..50.0 | 31554..33981 (123/66..132/189) | 42469..46110 (165/229..180/30) |
| rig-beam-planes-10 | 110 | U1.145 (ch 145-148) | NODE-LEFT-A | house left (x -32.5, z -16.9) | 3.0 | -10.0..+10.0 | 23.5..38.5 | 353.0..13.0 | 51.5..66.5 | 31554..33981 (123/66..132/189) | 38463..42104 (150/63..164/120) |
| rig-beam-planes-11 | 111 | U1.161 (ch 161-164) | NODE-LEFT-A | house left (x -32.5, z 22.1) | 60.0 | -10.0..+10.0 | 38.0..53.0 | 50.0..70.0 | 37.0..52.0 | 31554..33981 (123/66..132/189) | 41988..45629 (164/4..178/61) |
| rig-beam-planes-12 | 112 | U1.177 (ch 177-180) | NODE-LEFT-A | house left (x -35.5, z -1.9) | 30.0 | -10.0..+10.0 | 35.0..50.0 | 20.0..40.0 | 40.0..55.0 | 31554..33981 (123/66..132/189) | 41259..44900 (161/43..175/100) |
| rig-beam-planes-13 | 113 | U1.193 (ch 193-196) | NODE-LEFT-A | house left (x -35.5, z 16.1) | 96.0 | -10.0..+10.0 | 35.0..50.0 | 86.0..106.0 | 40.0..55.0 | 31554..33981 (123/66..132/189) | 41259..44900 (161/43..175/100) |
| rig-beam-planes-14 | 114 | U1.209 (ch 209-212) | NODE-LEFT-A | house left (x -35.5, z 10.1) | 45.0 | -10.0..+10.0 | 36.5..51.5 | 35.0..55.0 | 38.5..53.5 | 31554..33981 (123/66..132/189) | 41618..45259 (162/146..176/203) |
| rig-beam-planes-15 | 115 | U1.225 (ch 225-228) | NODE-RIGHT-A | entry (x 18.5, z 49.1) | 192.0 | -10.0..+10.0 | 33.5..48.5 | 182.0..202.0 | 41.5..56.5 | 31554..33981 (123/66..132/189) | 40892..44532 (159/188..173/244) |
| rig-beam-planes-16 | 116 | U1.241 (ch 241-244) | NODE-RIGHT-A | house right (x 27.5, z 22.1) | 144.0 | -10.0..+10.0 | 33.0..48.0 | 134.0..154.0 | 42.0..57.0 | 31554..33981 (123/66..132/189) | 40780..44421 (159/76..173/133) |
| rig-beam-planes-17 | 117 | U1.257 (ch 257-260) | NODE-LEFT-A | house left (x -29.5, z 34.1) | 102.0 | -10.0..+10.0 | 38.0..53.0 | 92.0..112.0 | 37.0..52.0 | 31554..33981 (123/66..132/189) | 41988..45629 (164/4..178/61) |
| rig-beam-planes-18 | 118 | U1.273 (ch 273-276) | NODE-LEFT-A | house left (x -17.5, z 34.1) | 120.0 | -10.0..+10.0 | 10.0..25.0 | 110.0..130.0 | 65.0..80.0 | 31554..33981 (123/66..132/189) | 35205..38846 (137/133..151/190) |
