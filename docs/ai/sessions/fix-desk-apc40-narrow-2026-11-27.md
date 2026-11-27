## 2026-11-27 — drawn APC40 stays visible and readable in a narrow light window

Owner: "fix and update ui that i can see what is what" (his light window is 606x780 CSS px).

- `serverXR/src/lighting/ui/apc40draw.js`: under 640 px the drawing was hidden (tables only); under 1000 px it was shrunk to unreadable type. Now a pane narrower than the unit at READ_SCALE (1.1) draws the unit at 1.1x inside a pan box (class `pan` on `.apc40`), first in the pane, with Left / Right step buttons, drag, wheel and scrollbar. Wider panes are unchanged.
- `serverXR/src/lighting/tools/apc40-readable-check.mjs`: 606x780 added to the default sizes; asserts drawing visible, drawing before every table, min px >= 11, 0 cut, 0 duplicate short names, 0 labels under bars, and that the step buttons reach both ends. The scratch-only guard is untouched.
- Measured on a di-dev scratch desk with the 11-27 03:49 show checkpoint (80 looks, 2 pages): 606x780 pad name 12.0 px, leader label 12.0 px; 1534x830 11.0 / 12.0 px and 1536x864 11.0 / 12.0 px, the same as before.
- Not checked: the owner's real window.
- Rollback: revert the PR.
