## 2026-10-28 — shared sizes: 12 px floor, normal-letter labels, readable greys, underlined links (UX audit S05)

- The owner said "ok fix everything" after the deep UX audit; this is slice S05 (findings F140, F128), answers Q1 A.
- `src/styles/base.css`: type rungs 1 and 2 now 12 px; `--di-label-tracking` 0.02em; new `--di-label-case: none`, `--di-target-min: 24px`; `--di-faint` .46; `--ui-border` .42 cyan; bare links in a paragraph underlined. 30 label rules in 15 stylesheets read `var(--di-label-case)`; `legal.css` links underlined; `controls.css` labels on the tokens.
- Tests: new cases in `brandTokens.test.js` and `contrast.test.js`; `landingBrand.test.js` follows the new token. Related suites (styles, landing, pages, wiki, surface bar, account button) pass.
- Not done: Studio and tool stylesheets keep 679 literal px sizes (S09 to S12); labels that set capitals by a literal (not by the tracking token) are untouched; if the owner answers Q1 B the labels keep capitals at the new size: set `--di-label-case: uppercase`, one line.

## 2026-10-28 (round 2) — review FIX-FIRST: proof pictures, mobile run, one real overflow found and fixed

- 390 px picture of the local home on the dev stack showed the 12 px rung had broken the door row (`.lh-doors`): "Phones & headsets" broke in two, "What is di.iiii?" was cut at the right edge. Fixed in `src/landing/localHome.css` (row wraps, each door nowrap); guard `brandTokens.test.js` "the local-home door row" (fails on the round-1 CSS); known-fixes round-2 line. After: all 7 doors visible on 2 rows, `overflowEls` 1 to 0.
- Proof (outside the repo, `agent-reports-2026-10-28/ux-fix/S05-round2/`): after pictures of `/`, `/wiki`, `/terms`, `/for-apps` at 1440 and 390 (`after-fixed/`, door-row bug in `after/`); before pictures are the audit capture at 4ef52d1b7 (`ux-audit/capture/shots/wiki/phone.png` and others). `metrics.log` holds the numbers.
- `scripts/verify-surfaces.mjs --mobile-only` (the body of `npm run verify:surfaces:mobile`, run through a CDP adapter on the agent-screen browser, pages `/ /wiki /terms /for-apps`, 5 devices): 15/20 ok, overflow 0 on all 20; the 5 problems are 404s of `/serverXR/api/resolve/<slug>` on `/` (the installed di answers the same 404, `curl .../resolve/main`), not CSS.
- Not seen: Studio hub and rig build (the dev stack's data has no `cinema-house` / `scene-house`, both pages say Not found); `/spaces` (hangs the agent browser, ledger N1413); the owner's look at `--ui-border` .30 to .42 (brighter control edges on 245 uses) is still owed to him.

## 2026-10-29 — independent review (judge)

- `.device-code` (`src/pages/deviceLogin.css`) is a code to copy, not a label: it keeps its 0.16em spacing; the 0.02em label tracking had reached it through the token. No case change needed (the letters are capitals already).
- Provenance: Q1 A is the UX plan's default the owner took with "ok fix everything", not a separate answer; the comments in `base.css`, `brandTokens.test.js` and the known-fixes line now say so.
- Checked: the 8 new tests fail on the origin/dev stylesheets (8 failed, 25 passed) and pass on this branch.
