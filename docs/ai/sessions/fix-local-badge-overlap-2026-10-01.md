## 2026-10-01 — the LOCAL tier chip no longer covers the scene deck's bottom bar

Owner review: the green "LOCAL local.thedi.studio" chip (`src/components/ModeMark.jsx`, `modeMark.css`, fixed
bottom-left, z-index 10001) sat on UNDO / RESTORE LAST GOOD (1440x900) and MARK THIS AS GOOD (390x844) of
`/{space}/scenes/{project}` (`.rigscenes-foot`, sticky bottom, `src/rigbuild/scenes.css`).

**Fix (smallest, reusable):** `modeMark.css` defines `--di-mode-mark-clearance` on `:root`
(`calc(44px + env(safe-area-inset-bottom))`: 10px offset + ~24px chip + air). A page with a bottom action
bar adds it to that bar's bottom padding. `.rigscenes-foot` does. The chip is not hidden; it still says which
tier you are on. The next page with a bottom bar uses the same variable.

**Guard:** `src/rigbuild/modeMarkClearance.test.js` reads the CSS sources (variable exists, covers chip
offset + height, deck bar uses it).

**Not seen on a screen** (asserted in CSS only). Owed: a look at 1440 and 390 px. Note the chip also
collapses to a thin line after 4 s; the reserved strip stays (a constant 44 px gap under the bar).
