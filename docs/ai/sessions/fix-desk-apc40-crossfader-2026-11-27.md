## 2026-11-27 — the drawn APC40 crossfader is a real mkII crossfader

- Owner (N7633): the crossfader read as a broken cross (tall cap on a thin line, a vertical tick across it), ran next to the AKAI logo, A and B floated away from it.
- `serverXR/src/lighting/ui/apc40draw.js`: a horizontal track with a short, wide cap riding on it (3.2 % of the panel height); end stops sit at the two ends and never cross the track; A and B sit 1.2 % outside the ends, centred on the track; the old dark groove behind the cap is gone. Both views (Labelled, Real layout) share the drawing.
- `serverXR/src/lighting/tools/apc40-readable-check.mjs`: new overlap assertion (screen boxes of logo, AKAI, crossfader, A/B and end stops must not intersect any other drawn element; label vs label too; controls vs controls are not checked) at 606x780, 662x830, 1534x830, 1536x864 in both views; 662x830 added to the default sizes. Result: 0 overlaps over 230 drawn elements per page, 16 page checks.
- Pictures and log: apc-look/r4/ (before-*, after-*, check-after.log, after/).
- Not checked: the owner's real screen, the live desk. Rollback: revert the PR.
- Round 2 (review nits): end stops 1 px floor (`max(1px,.09%)`, left stop anchored by its right edge); thin boxes count at any positive overlap; self-test `APC_OVERLAP_SELFTEST=1` forces the crossfader onto AKAI and the check FAILS (apc-look/r4/check-selftest.log); dead geometry write dropped; wording matches the code.
