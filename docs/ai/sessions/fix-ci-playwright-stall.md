# fix/ci-playwright-stall — the hang becomes a hiccup

The "Install Playwright Chromium" step stalls forever some days (the known
failure in reference_dii_ci_playwright_hang / CURRENT.md's deploy notes).
2026-08-20 alone it hung four runs past 12 minutes; each needed a manual
cancel + rerun.

## What changed

One change, one file: the step gets `timeout-minutes: 6` and two bounded
attempts (`timeout 150 npx playwright install …` with one retry). A stall now
self-heals in ~2.5 minutes or goes honestly red in six — no more zombie
deploys. browser-checks.yml is the single home of the step (reused by PR CI
and the deploy), so this covers both.
