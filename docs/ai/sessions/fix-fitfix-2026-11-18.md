## check:fit - one command that fails when something visible does not fit

- What: `scripts/check-fit.mjs` (`npm run check:fit`): admin sections + landing at 1800x1000, 1440x900, 1536x864, 390x844, 372x900; exit 1 on clipped text, box past an ancestor clip or the right edge, page scrolling sideways. Deliberate ellipses carry `data-fit-ok`. Wired into `.github/workflows/browser-checks.yml` (CI step not yet run).
- Why: the owner saw a chip cut to "Space: mai" and a Machines column at 372 px; no test measures layout. Neither fault reproduced on the installed di (87a9c812) or dev; detection is proved by `--inject` of the fault shapes.
- Run: `di-dev up <tree> --api scratch`, then `node scripts/check-fit.mjs --base http://<tree>.diiii.localhost`.
