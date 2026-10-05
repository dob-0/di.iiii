## 2026-10-05 — /tools versions come from the lock files, so Dependabot bumps can pass

- Eight Dependabot PRs (#687–#693, #695) failed CI on one test only, each naming its own package:
  `kitCatalogue.test.js` › "prints the version and licence of the package that is installed".
  `src/kit/kitStack.js` typed every npm version by hand.
- `virtual:kit-versions` (`kitVersionsPlugin` in `vite.config.js`) reads the table's `npm:` names
  with acorn and resolves each from `package-lock.json` / `serverXR/package-lock.json`.
- Guard test: no hand-typed npm version; every listed package must be in its lock file.
- Proof: #691's lock change on this branch → kit tests 32/32; /tools seen on the dev server,
  desktop and phone (390 px, no sideways scroll).
- Still owed after this lands: each Dependabot PR needs a rebase onto dev (`@dependabot rebase`)
  to pick this up; #694 (three-mesh-bvh 0.7 → 0.9) and #689 (three 0.185 → 0.186) want a look
  in a 3D scene before merging — a green test run is not that look.
