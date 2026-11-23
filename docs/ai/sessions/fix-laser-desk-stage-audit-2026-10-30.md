## 2026-10-30 — laser desk fixes from the venue stage audit (rows 2, 3, 6, 7, 10, 19, 22, 23, 24, 25, 29, 30, 31)

- Blackout always works: B is handled before the field check (a text field keeps its own B), a second B inside 400 ms and a held B are ignored; the top-bar button only turns it on; Release or Shift+B lifts it; the desk's Blackout calls the engine's blackout even when released or another Out drives a cube.
- Keys act on the Control page only (digits, Enter, Delete, Backspace, arrows, F2, Ctrl+D) and a held key does not repeat.
- Placement cannot jump: Setup sliders show their number and send one change on release; the wheel changes nothing there or on Edit sliders (Alt+wheel still nudges); the Setup table is not rebuilt while a slider has focus or a pointer is down; an out-of-range placement is refused (400), not clamped.
- Cuts are counted: per cube `lit`, `blanked`, `offField`, `offPercent`, `dark`; the Stage card says "N % of this look is off the field"; `driving` is true only while something is lit.
- The 50 ms tick catches and logs its own errors, once per distinct message.
- 29 new tests (`laserDeskStageAudit.test.js`, `ui/desk.test.js`), 26 fail on the code before. Not done here: audit rows 1, 4, 11, 18 (the saved placement), 5/20/26/41 (draw load, partly #1224), 8, 9, 12-17 (engine and light desk).
