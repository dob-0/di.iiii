## 2026-10-04 — add files to a sources project that already hangs

- **What.** `scripts/place/add-sources.mjs`: reads the project `<space>-sources`, skips files whose name is already
  on it, uploads the rest, hangs them in new rows above the top row. `import.mjs` now exports `uploadAsset`,
  `sendOps`, `must`, and `uploadAsset` takes `onRefused` so a refusal carries name, size, status, reason.
- **Why.** In space `moxir` the project `moxir-sources` holds a wall of 37 hall photos hung by `import.mjs` on
  09-23. 14 files exist that are not on it (12 X-T5 JPGs, plus a 111 MB mp4 and a 17 MB jpg the first import
  skipped). `import.mjs` hangs a whole folder once and cannot add to a wall that exists.
- **Why a separate file.** `import.mjs` needs a `place.json` work folder and a hall to run; this needs only a
  space, a folder and the API.
- **Layout.** The wall was built with the total known, so its top row is the contact sheet's first row. New
  pictures use `sourceWallSlot` with the total unknown (a full row of 8, centred), starting one row above the
  highest picture read from the document, so no existing transform is touched. Limit: about 8.6 m up on a 37-picture
  wall; owner may prefer a second wall beside it (not built).
- **How proven.** vitest, `scripts/place/add-sources.test.js`, 7 tests against a stand-in server; with
  `import.test.js` `Tests 24 passed`. Each guard fails when its fix is reverted (layout 1 failed, skip guard 3,
  refusal report 1, exit code 1, bare-name match 1) and the file has `no tests` (fails to load) on origin/dev.
  NOT run against any real server: the dry run on moxir and the real run are the next step, and the wall has to be
  looked at in the browser afterwards.
- **Limits.** Name match only (a renamed copy of a hung picture would be hung again). Reads the document once and
  does not re-check between upload and write (a concurrent writer to the wall could produce a clashing id). No
  delete or rename of pictures.
