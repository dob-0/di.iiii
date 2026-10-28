## 2026-10-28 — shared sizes: 12 px floor, normal-letter labels, readable greys, underlined links (UX audit S05)

- The owner said "ok fix everything" after the deep UX audit; this is slice S05 (findings F140, F128), answers Q1 A.
- `src/styles/base.css`: type rungs 1 and 2 now 12 px; `--di-label-tracking` 0.02em; new `--di-label-case: none`, `--di-target-min: 24px`; `--di-faint` .46; `--ui-border` .42 cyan; bare links in a paragraph underlined. 30 label rules in 15 stylesheets read `var(--di-label-case)`; `legal.css` links underlined; `controls.css` labels on the tokens.
- Tests: new cases in `brandTokens.test.js` and `contrast.test.js`; `landingBrand.test.js` follows the new token. Related suites (styles, landing, pages, wiki, surface bar, account button) pass.
- Not done: Studio and tool stylesheets keep 679 literal px sizes (S09 to S12); labels that set capitals by a literal (not by the tracking token) are untouched; if the owner answers Q1 B the labels keep capitals at the new size: set `--di-label-case: uppercase`, one line.
