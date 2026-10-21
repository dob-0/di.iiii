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
