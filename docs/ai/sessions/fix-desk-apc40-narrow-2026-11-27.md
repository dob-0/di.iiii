## 2026-11-27 — drawn APC40: Labelled and Real layout views, both at every width

Owner: "fix and update ui that i can see what is what"; N7606: "we have midi ui from the di sound music u can see that"; N7621: "i want to both i mean what we have now and also the UI midi from the di sound".

- `serverXR/src/lighting/ui/apc40draw.js`: a two-button switch ("Labelled", "Real layout") sits next to the pane heading. Labelled = the drawing with leader lines; under 1000 px it is drawn at 1.1x in a pan box with Left / Right buttons (trackpad, scrollbar or buttons) so names and lines stay >= 11 px. Real layout = the di music page's view (studio-music devices.js fitApc): whole unit fitted to the width, no pan, pads show their number, the PADS / BUTTONS lists below name them. The choice is kept per browser (localStorage `deskApcView`); until picked: Labelled when the pane is wide, Real layout when narrow.
- `serverXR/src/lighting/tools/apc40-readable-check.mjs`: both views at 606x780, 1534x830, 1536x864: drawing visible and first, switch in view, min px >= 11, 0 cut, 0 duplicates, 0 labels under bars, Real layout whole (no pan), Labelled narrow pans to both ends. Scratch-only guard kept.
- Measured (scratch desk, the live desk's 120 looks, GET only): pad min / leader min px: 606x780 labelled 11.0 / 12.0, real 11.0 / none drawn; 1534x830 labelled 11.0 / 12.0, real 14.0; 1536x864 labelled 11.0 / 12.0, real 14.0.
- Not checked: the owner's real window.
- Rollback: revert the PR.

## Review nits (r3b)

- The "Labels with leader lines" checkbox is hidden in Real layout, where it does nothing.
- Narrow Labelled view: the empty band above the leader labels in view is trimmed (the unit is pulled up under them as the pan box scrolls); band 55 px -> about 25 px at 606x780. Check re-run, all 6 combinations PASS (log in apc-look/narrow/r3b/).
