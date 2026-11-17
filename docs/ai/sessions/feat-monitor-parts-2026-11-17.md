## 2026-11-17 — Monitor "Parts", steps 1–2: the parts list and a per-part version stamp (no UI yet)

- Why: owner wants everything on one eye in the Monitor (light desk, show desk, 3D space, a version of each, known bugs). Advice from Opus and Fable (independent, read-only) agreed: one "Parts" tab, version = last commit touching the part's dirs, stamped at pack time because the installed server is not a git checkout; known-fixes shown as "fixes recorded", never "bugs".
- Step 1: `serverXR/src/parts.json` (8 parts: id, name, dirs, probe or null). `serverXR/src/parts.test.js`: unique ids, every dir exists, probe shape, and a guard that the light desk is probed only through `/light/api/clock` (any other light route builds the desk: 40 Hz loop + Art-Net bind, `serverXR/src/routes/lightingRoutes.js`); with the probe changed to `/light/state` the guard failed (1 failed).
- Step 2: `scripts/partStamps.mjs` (git log -1 per part, null when git is absent or the output is odd), written into `release.json` as `parts[]` by `scripts/pack-runtime.mjs`; `serverXR/src/releaseInfo.js` now keeps `version`, `schemaVersion`, `packedAt`, `parts` (max 32, strings only; before, it dropped all four). Tests: `scripts/partStamps.test.js`, `serverXR/src/releaseInfo.test.js`.
- Measured on the repo: light 528e3b6b2 (11-12), show/laser c91431f68 (11-01), studio 64ed0876a (11-12), raw/perform c9c908e63 (11-11), ndi bab5ef5f8 (09-24), osc 4f173c44f (10-28).
- Tests: 6 files, 56 tests pass (parts, partStamps, releaseInfo, monitorHub, monitorStore, dataRootGuard). eslint: 0 errors.
- Not done: steps 3–5 (the hub collects health; fix and issue counts; the Parts tab). Rig left out of the list (its probe was not verified). Not packed end to end: `pack-runtime.mjs` was not run, only its stamp function on the real repo.

### Step 3 (same branch)
- `monitorStore.js`: Connected panel gains a Light desk row, read only through `/light/api/clock` (guarded by `parts.test.js`).
- `monitorHub.js`: snapshot gains `parts` = { rows[{id,name,state,detail,commit,date}], version, packedAt }; state is joined from the Connected rows already read (no extra probe per viewer), worst state wins, no probe = `unprobed` ("no live probe"), unread = `off`; never shown healthy by default.
- Tests: 2 new in `monitorHub.test.js`; monitorHub + monitorStore + parts = 40 passed; eslint 0 errors.
- Not done: steps 4 (fix and issue counts) and 5 (Parts tab); no UI shows `parts` yet.

### Step 5 (same branch; step 4 skipped by the owner's word "jump to step 5")
- `src/components/preferences/MonitorParts.jsx` + fourth tab "Parts" (key 4) in `MonitorSection.jsx`: one row per part (name, state · detail, short commit · changed date · packed date). No stamp = "version unknown (not stamped)"; no probe = "no live probe"; neither is drawn green.
- Tests: `MonitorParts.test.jsx` (4) + `MonitorSection.test.jsx`: 2 files, 47 passed; eslint 0 errors.
- Looked at on the agent screen against a scratch server of this tree (`parts.diiii.localhost`): 8 rows at 1440 px and at 390 px, screenshots opened. Box-escape check on Monitor and Parts at 1440/700/390: PASS, 0 escapes.
- Not done: fix and issue counts (step 4); version shows "not stamped" until an install is packed with this branch; not installed; the box-escape script lives on another branch (copied temporarily, removed).
