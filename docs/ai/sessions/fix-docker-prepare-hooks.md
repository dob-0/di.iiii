## 2026-09-29 — dev deploys again: the image build gets the git-hooks script before npm ci

- Every dev deploy since 2026-09-28 20:28 failed at `npm ci` in the client image: #612's
  `prepare` runs `scripts/install-git-hooks.mjs`, which the Dockerfile had not copied yet.
  Six landings (#638–#642 and #643) sat undeployed; dev kept the older build.
- Fix: the root `Dockerfile` copies that one script before `npm ci`. With no git checkout in the
  image, the script exits 0 (checked outside a checkout, `npm run prepare` → exit 0).
- Guard: `src/dockerfileInstallScripts.test.js` fails when a Dockerfile runs `npm ci` without the
  files its install scripts need (red on the old Dockerfile). serverXR's image is unaffected: its
  package.json has no install scripts.
- Owed: a PR check that builds the client image, so this class of failure shows before a merge.
