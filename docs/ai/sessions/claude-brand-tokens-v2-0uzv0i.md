## 2026-10-21 — brand spec v2 in the token layer: square corners, the accent on light, the wordmark rules, the live green named

- **M17:** `--di-radius` in `src/styles/base.css` is `0` (was `2px`). 255 `var(--di-radius)` uses in `src/` follow. `docs/ai/golden_rules.md` → "Controls are rectangles": `0–2 px` became `0 px` and `write 2px` became `write 0`, citing the owner's 2026-09-30 words "in design we not use the round things". The recording-light sentence stays, marked as the agent's wording and open owner question Q4.
- **M13:** two new tokens, no users yet. `--di-accent-on-light: #0097a3` (the wordmark's dot and UI marks on white or paper) measures 3.53:1 on #fff and 3.29:1 on #f7f7f5. `--di-accent-ink-on-light: #00757f` (accent text on light) measures 5.45:1 and 5.08:1.
- **M37:** base.css now has `.name{text-transform:none}`, `.dot{color:var(--di-cyan)}` and `.di-name` (700, `var(--di-sans)`, -0.02em). Every `class="dot"` in src/ and spaces/ was listed first: 32 files, all in `spaces/network/`, all the wordmark's dot. Those pages do not load base.css. src/ has no `.dot` or `.name` user. So the rule is unscoped. The landing keeps `lp-dot`.
- **M23:** the `--di-live-rgb` line carries `/* quotation of Dracula's green (SYSTEM rule 8) */`. The value is unchanged.
- **Guard:** `src/styles/brandTokens.test.js` (4 cases, WCAG 2.2 luminance computed in the test). On dev's base.css all 4 fail; on this branch all 4 pass.
- **Pictures:** `docs/ai/handover/brand-tokens/` has 5 surfaces × laptop/phone × light/dark, before and after, each pair joined in `pair-*.jpg`, plus `pixel-diff.json` and `radii-*.json`.
  - Studio controls at 2 px went from 56 to 2 (laptop) and from 11 to 2 (phone).
  - The viewer's 5 overlay buttons and the rig plot's 11 controls did NOT change. They write `2px` literally (`publicViewerStyles.js`, `src/rigbuild/build.css`); 27 files in src/ do. Changing them is a separate, per-surface job.
- Not in this job: `--di-faint`, the scrim, the landing hover (Q1), the tagline (Q2), recording-light dots (Q4).
- `src/studio/components/ScenePicker.test.jsx` read the token only as `<n>px`, so the unitless `0` gave NaN. The unit is now optional; the test still holds the corner at ≤ 2.
- Full `npm test`: 11873 pass. The 4 failures left are in `scripts/di/oneAddressPrinted.test.js` (the `di` CLI's address lines), and they fail identically on an untouched origin/dev checkout in this container, so they are not this branch's.

## 2026-10-21 — addendum: one radius rule, native controls on dark, the ladder in --ui-*, palette provenance

Rows relayed by a peer session from two audits. The owner's decision, as relayed: corners are 0 px for every control and status dots stay round. Q4 is closed and golden_rules.md now says it as his decision.
- **One radius rule:**
  - `docs/ai/ui-system.md`'s radius table (6, 7, 4, 3, 2 px, "map to the nearest entry") is now one rule: `0`, status dots round.
  - `golden_rules.md`'s two panel/button radii (`6–7px`, `6px`) are now `0`.
- **Native controls:** `:root` gets `color-scheme: dark` and `accent-color: var(--di-cyan)`. Measured in Chromium:
  - /perform's "Follow Light" checkbox went from `normal`/`auto` (UA blue) to `dark`/`rgb(77,249,255)`.
  - In the Studio inspector, all 10 native controls (color, range, checkbox, select) now compute dark/cyan. The visible pixels did not change (0 %), because the inspector draws its own controls.
  - **Guard a:** `html.dii-embed { color-scheme: normal }`, and `colorScheme: 'normal'` on both code-view iframes in `PublicProjectViewer.jsx`.
    - The viewer embedded in an ordinary host is 99.6 % transparent with the guard and **0 %** (an opaque box) with only the guard removed.
    - A transparent code page in an iframe inside the dark document is 2.3 % transparent without the guard and 99.9 % with it.
  - **Guard b:** `.rigplot, .rigsheet { color-scheme: light; accent-color: var(--di-accent-on-light) }`, placed in base.css because the patch sheet does not load plot.css. The equipment order's two date fields compute `light` and `rgb(0,151,163)`, with 0 % pixel change.
  - **Guard c:** `--di-radius-pill` stays `999px`, and the test pins it.
- **The ground ladder:**
  - `--ui-surface-raised` and `-muted` changed from `#111` to `var(--di-surface-2)` (#111114).
  - `--ui-surface-highlight` is now `var(--di-cyan-wash)`.
  - One comment names the ladder.
  - `--axis-*` is marked as a quotation of Blender's axis colours; its values are unchanged.
- **Palette provenance:** dracula-theme's LICENSE was read 2026-10-21: MIT, © 2023 Dracula Theme.
  - nodeRegistry's header now names the 7 values that are Dracula's. The other values in those tables are not Dracula's, and the comment says so.
  - The values themselves are unchanged.
  - **RawViewport.jsx:183/218 was NOT annotated:** its `#5fa8ff` is not a Dracula colour, so labelling it as one would be false.
- **Test:** `src/styles/brandTokens.test.js` grows to 11 cases.
  - Before the addendum: 6 of the 7 new cases failed. Guard c passed already; it pins a value against a future shortcut.
  - After: 11/11 pass.
- **Pictures:** `pair-perform-*`, `pair-studio-inspector-*` and `pair-equipment-order-*`, plus `addendum-{before,after}.json` and `embed-*.json`. For /perform, `/light/api/clock` was stubbed to `up:true` in the browser, since no light desk runs in this stack.
