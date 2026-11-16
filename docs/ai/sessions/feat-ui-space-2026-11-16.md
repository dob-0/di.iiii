## Space audit tool for the admin desk and Monitor (branch feat/ui-space-2026-11-16)
- Adds scripts/ui/space-audit.mjs: opens the admin desk home, each Monitor tab and the full Monitor at nine device sizes (phone, tablet, half window, laptop, desktop, big) and measures how much of the first screen is information.
- Adds scripts/ui/space-audit-lib.mjs: the pure maths (rectangle union, padding share, empty area, text lines, touch-target classes, offender score), with a vitest test next to it.
- Adds scripts/ui/space-audit-report.mjs: turns the per-viewport JSON into one ranked report (15 worst offenders, main-view-starts table).
- Reads only: other hosts are aborted, the only clicks are the Monitor tab buttons and the Map 2D/List switch. No UI is changed.
- Measures per screen: where the main view starts, facts shown, ink share, per-component box numbers, empty area, small and oversize touch targets, horizontal overflow.
- Tested: space-audit-lib.test.mjs (11 tests). The browser side was run against a scratch preview stack, not in CI.
- Not tested: output stays outside the repo (JSON, pictures, report are not committed).

## Monitor "One place" layout (same branch)
- New default layout "place": rail (live mark, priority+ vital chips with "+N", worst need with its action, filter, Pause, Keys, Full, layout toggle), dock (agents, helpers, asks; folds), stage (the map fills it), panel (detail, Work, lists, Activity; a bottom sheet on phones), ask line with the activity ticker. The tabbed layout stays as mode "tabs" (rail toggle "Tabs", old bar button "One place"). Choice in localStorage `di.monitor.layout`, `layout` prop overrides.
- Files: MonitorPlace.jsx, monitorPlaceFit.js (pure fit function, own test), MonitorWorkspace.jsx (split into hook + parts, same DOM), MonitorMap.jsx (`aspect` prop), MonitorSection.jsx (state kept, two renders), preferences.css (.monitor-place / .mp-*), space-audit.mjs (`--layout place|tabs`, stage-top and 2D-overlap metrics).
- Tests: MonitorPlace.test.jsx (7), monitorPlaceFit.test.js (7); MonitorSection.test.jsx now renders `layout="tabs"` in all 29 tests (they assume tabs).
- Measured (scratch preview, 9 viewports): stage top 10.7-23.7 % of the height, 0 horizontal overflow. Not met: small map-node targets at 640 wide (21-23 px cards with 25 nodes; List view has full-size targets), tablet desk chrome buttons (32 px, not Monitor), 2D label overlaps 1 at 2560 and 6 at 768x1024.
- Separate commit: desk home at 600-899 px stacks (tiles no longer cover group titles).

## Round 2 (2026-11-16)
- MonitorMap.jsx: semantic zoom on the 2D map. Node positions follow the view; cards keep their px size and type (two lines, one line for helpers, to do and repos; width follows the text); the nudge (monitorMap3dPolicy.js nudgeLabels) runs on screen positions; Fit shows every node and keeps them off the view switch, zoom tools and key. The minCard zoom and the Readable button were removed.
- MonitorPlace.jsx / MonitorSection.jsx / preferences.css: Live/Sessions numbers, search icon, more menu, phones may use 2D, 3D or List, legend hidden in List.
- adminDesk.css: 44 px desk controls for a coarse pointer at any width; adminDeskCss.test.js guards it and the under-900 px home stacking (known-fixes entry, wiki line).
- space-audit.mjs: counts text over text (two visible text boxes, clipped to their own box and on top at their centre, intersecting by more than 2 px; the dev-copy banner is skipped).
- Flow (own commit): monitorFlow.js (pure: flowPulses, flowRates, perMinute, nodeOfKey; test monitorFlow.test.js), MonitorFlow.jsx (the Flow panel, opened from the rail's live mark, with Pause), pulses on edges and nodes in the 2D map, dashed silent edges, a short flash under reduced motion.
- Tested: vitest on Monitor*, monitor*, AdminDesk*, adminDesk* and scripts/ui; the browser side ran on a scratch preview stack (after2/).
- Cards are placed by packLabels (monitorMap3dPolicy.js, tested): a free place is searched (two-line cards, then one-line); when a stage is still too full the map says so and offers List or "Draw anyway". Coarse-pointer cards are 46 px or taller. Open: on phones the stage starts at 27-29 % (limit 20-25 %); the admin bar, window header and a two-row rail take 229 px.
