## 2026-09-29 — vitest 4 → 5 (dependabot #483), and eslint 10 re-checked

- vitest 5.0.2 from dependabot #483. Its one CI failure was the kit's own guard:
  `kitCatalogue.test.js` compares `src/kit/kitStack.js` with the installed version
  ("installed 5.0.2, table says 4.1.10"). Table updated. Full run on vitest 5:
  625 files passed, 1 skipped; 6878 tests passed, 7 skipped, 0 failed.
- eslint 10 (#559) is still blocked upstream (plugin peers stop at eslint 9);
  `dependency-decisions.md` carries the dated re-check. #559 closed.
