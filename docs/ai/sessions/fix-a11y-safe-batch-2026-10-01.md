## 2026-10-01 — a11y SAFE batch (F4 F7 F9 F10 F12 F15 F17)

Source: static WCAG 2.2 AA audit of 2026-10-01. Its findings were hypotheses; each was re-read on this tree before fixing. **Nothing here was seen on a screen** (no browser, no build, targeted vitest only). Branch `fix/a11y-safe-batch-2026-10-01`, not pushed.

- **F9 done.** AuthGate token field: `inputProps['aria-label']='Access token'`; autoFocus kept. Test `gives the access-token field an accessible name` (failed before).
- **F12 done.** Visible text and name are now both `Sound`; `aria-pressed` carries the state; the cyan colour keeps the on look (label-in-name, WCAG 2.5.3). Test `PublicProjectViewer.sound.test.jsx` (failed before). Owed: a sighted look that on/off is still obvious.
- **F17 done.** Plain sentence + next step, `role="alert"`, raw error in `title`. Test `AuthGate when the backend is unreachable`. No console logging added.
- **F4 partly done.** `<main>` (MUI `Box component="main"`) on Landing, StudioHub, SpaceHub roots. Checked: no CSS selects the `main` element; `useKeyboardPageScroll` uses a ref, not the tag. Test: StudioHub `is the page main landmark`. Landing/SpaceHub covered by their existing suites passing, no new test. Skipped: Studio shell (`StudioShell` is `role=application`, viewport files off-limits) and the skip link (cannot verify layout without a screen). Owed: look at Landing (nav now inside main).
- **F7 done, wider than listed.** Every CSS `color: rgba(255,255,255,.4|.45)` (30 declarations in 7 files, not the audit's 12) became `var(--di-text-muted)`. Borders/backgrounds untouched. Ratchet test added in contrast.test.js. Owed: a look at raw.css and algoVrithm.css, which the audit did not name.
- **F15 done.** `contrast.test.js`: muted 5.28, accent/danger/white AA, F7 ratchet, F2 allow-list (`--ui-border` 2.14, `--di-line` 1.22, white@.1 1.20) that fails if one is fixed or worsens.
- **F10 partly done.** `.preferences-collapse-toggle` got a 44 px `::before` hit area. **Needs a look:** `.insp-num-btn` (its parent has `overflow:hidden`, a pseudo-element would be clipped), the colour inputs (`<input>` cannot take a pseudo-element), `.rigequip-pick input` (already inside a 44 px `label`, so the label click target is 44 px; the bare 20 px input is unchanged).
- Not touched: F1 F2 F5 F6 F8 F11 F13, StudioViewport/StudioEditor/studioGuide.
