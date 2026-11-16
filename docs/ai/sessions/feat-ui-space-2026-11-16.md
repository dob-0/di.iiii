## Space audit tool for the admin desk and Monitor (branch feat/ui-space-2026-11-16)
- Adds scripts/ui/space-audit.mjs: opens the admin desk home, each Monitor tab and the full Monitor at nine device sizes (phone, tablet, half window, laptop, desktop, big) and measures how much of the first screen is information.
- Adds scripts/ui/space-audit-lib.mjs: the pure maths (rectangle union, padding share, empty area, text lines, touch-target classes, offender score), with a vitest test next to it.
- Adds scripts/ui/space-audit-report.mjs: turns the per-viewport JSON into one ranked report (15 worst offenders, main-view-starts table).
- Reads only: other hosts are aborted, the only clicks are the Monitor tab buttons and the Map 2D/List switch. No UI is changed.
- Measures per screen: where the main view starts, facts shown, ink share, per-component box numbers, empty area, small and oversize touch targets, horizontal overflow.
- Tested: space-audit-lib.test.mjs (11 tests). The browser side was run against a scratch preview stack, not in CI.
- Not tested: output stays outside the repo (JSON, pictures, report are not committed).
