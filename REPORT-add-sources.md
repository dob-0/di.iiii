# add-sources report (2026-10-04)
PR: https://github.com/dob-0/di.iiii/pull/753 (to dev, not merged). Branch feat/place-add-sources-2026-10-04, 2 commits.
Files: scripts/place/add-sources.mjs (new), add-sources.test.js (new), import.mjs (exports uploadAsset/sendOps/must; onRefused option), README.md, docs/ai/sessions/feat-place-add-sources-2026-10-04.md
Dry-run (reads the document, needs token, writes nothing):
  node scripts/place/add-sources.mjs --add-sources ~/Downloads/moxir-hall-photos-2026-10-02 --name moxir --originals --dry-run
Real run: same without --dry-run (add --allow-skips if the 111 MB mp4 refusal is accepted; default exit 2 on any refusal).
Tests: origin/dev code = new test file cannot load ("no tests"); with fix add-sources 12 passed; scripts/place total "Tests 187 passed (187)".
Mutations that each failed a test: layout, skip guard, bare-name match, refusal report, exit code, swap-when-not-larger, no read-back, flag ignored, widened patch (proof logs in scratchpad proof.txt, proof2.txt).
Limits: new rows hang ABOVE the top row (~8.6 m up on the 37-wall) - owner may want a wall beside; name match only; no re-check between read and write; NOT run on any server, not looked at in a browser; 111 MB mp4 over MAX_UPLOAD_MB=100 will be refused (not transcoded); the dry run's swap list depends on dev's asset.size being the reduced size.
