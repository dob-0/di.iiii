## 2026-11-27 — drawn APC40 fits a narrow light window whole, like the di music page

Owner: "fix and update ui that i can see what is what"; round 2 (N7606): "we have midi ui from the di sound music u can see that".

- The di music page (studio-music `page/devices.js` fitApc) draws the native 1108 px panel and scales it uniformly to the card width, no sideways scroll; its printed labels are 8 px at 606 px and it has no pad names.
- `serverXR/src/lighting/ui/apc40draw.js`: under 1000 px the desk does the same (whole unit at the width, class `overview`). Pad names and leader labels would be under 11 px there, so each pad shows its NUMBER (11 px) and the PADS / BUTTONS lists below name every one; leader labels are not drawn. Wider panes are unchanged. Round 1 (pan box at 1.1x, commit 631a4f26c) is replaced; it stays in git history.
- `serverXR/src/lighting/tools/apc40-readable-check.mjs`: 606x780 asserts drawing visible, first, whole (no pan), pad numbers >= 11 px, 0 cut, 0 duplicates, 0 labels under bars. Scratch-only guard kept.
- Measured on a scratch desk with the live desk's 120 looks (GET only; steps emptied to a template): 606x780 pad number 11.0 px, no leader labels; 1534x830 11.0 / 12.0 px; 1536x864 11.0 / 12.0 px (as before).
- Not checked: the owner's real window.
- Rollback: revert the PR.
