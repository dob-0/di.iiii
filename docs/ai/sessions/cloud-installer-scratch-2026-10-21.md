## 2026-10-21 — the installer's rehearsal copy never outlives its run

- `di update` rehearses on a copy of the data folder in the system temp directory. It is now removed in a `finally` on every path: run worked, run threw halfway, or the copy itself died halfway. If removal fails, one line names the path.
- Measured: `scripts/di/updateSafety.test.js` 19 passed (5 new, using a private TMPDIR); with the cleanup removed, 4 of the 5 fail. `eslint scripts/di` clean.
- Not tested: a real `di update` end to end on a multi-GB data folder. `scripts/di/oneAddressPrinted.test.js` has 4 failures that are identical on plain dev (name resolution in this sandbox), not from this change.
- Still open: `smokeTest` makes an empty `di-smoke-*` folder on a first install and never removes it.
