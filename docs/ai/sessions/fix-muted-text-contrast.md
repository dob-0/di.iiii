## 2026-08-23 — the dark theme's secondary text was below the readability floor, and nothing could have told us

- Came out of a walkthrough audit of the product as a stranger: the landing page's own
  explanation of what di.iiii is was hard to read on a phone. Measured rather than argued —
  `rgba(255,255,255,0.4)` on black is **3.66:1**, under the 4.5:1 WCAG AA floor for body text.
- **61 failing text nodes** across `/` (54) and `/spaces` (6), plus one hardcoded outlier. All
  but one came from a single token, `--di-text-muted`, so the fix is one line: `0.4` → `0.5`
  (5.28:1). It still reads as muted next to `--di-text`; nothing about the design changes.
- The outlier was `.lp-enter-note` at `rgba(255,255,255,0.2)` — **1.66:1, wrapped around a real
  link**. No alpha below ~0.46 clears the floor, so a credit line that stays readable has to be
  quiet by size, caps and letter-spacing rather than by being invisible.
- Guard reads the stylesheets and computes WCAG luminance itself (`src/styles/contrast.test.js`):
  one test on the token, one sweeping `landing.css` for any faint hardcoded white. Both watched
  failing against the old values before being restored — the second one is what found the
  outlier the token change alone left behind.
- Verified by eye at 1440×900 and on iPhone 13, before vs after, on a clean worktree served
  beside staging.

### Worth knowing

- This class of defect is invisible to every gate the repo has — lint, tests, build and the
  docs check all pass on unreadable text, and it looks intentional on screen. The guard above is
  the first thing in the repo that reads a colour and judges it.
