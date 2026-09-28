## 2026-09-29 — batch: the sign-in hub, AI restyle, and the green dependency bumps

- One batch branch carries #636 (the sign-in hub), #631 (Emilya's AI restyle on camera
  surfaces), #603 (sACN universe 1 — its change had already reached dev), and the
  dependabot bumps #557 #561 (docker actions) and #482 #556 #558 #560 (server: morgan,
  dotenv, nodemailer, multer). The four server bumps were applied as one lock-file change,
  because all four rewrite `serverXR/package-lock.json`.
- dotenv 17 → 18 is a major version: it removed `-r dotenv/config` preloading and
  `.env.vault`. The server uses neither (only `config({ path })` in `serverXR/src/index.js`).
  `src/kit/kitStack.js` lists the new versions. Licences unchanged (checked in the lock file).
- Conflicts: `serverXR/src/schemaSync.test.js` (#631's AI-effect tests beside dev's cue-loop
  and show-clock tests — both kept) and `LIGHTING_DESK.md` (dev's cue-runner section kept).
- Local: `vitest run` 6922 passed, 7 skipped, 0 failed; `npm run build` green.
- #433 closed: its note was folded on dev long ago (f669a15f).
- Left alone on purpose: drafts #587 #599 #625 #626 #627 (Emilya's and the MOXIR hall), and
  the two major bumps eslint 10 (#559) and vitest 5 (#483), which fail CI and go separately.
