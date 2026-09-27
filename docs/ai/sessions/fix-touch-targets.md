## 2026-09-27 — the bar and the desk's ways out are a finger tall under a finger

- Measured before: bar links 27px on a phone, 13px on a tablet (width-keyed rule); desk top links 25px.
- `--di-touch-target: 44px` (HIG / WCAG 2.5.5); bar and desk grow their targets under (pointer: coarse);
  `--sbar-h` follows. After: 44px on phone and tablet, mouse screens unchanged.
- Found while measuring, NOT caused here, next fix: when only More fits, More + Desk | Perform overflow the
  links row leftward over the project name (Priority+, #575) — More at x 232 inside a row starting at 235.
