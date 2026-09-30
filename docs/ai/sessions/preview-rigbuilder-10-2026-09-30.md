## 2026-09-30 — preview rigbuilder.10: the cut, the halo, the X, hall v4, smart view, beams in haze and the cue-layer fix, on one branch

Not for merging to dev. An integration branch (`preview/rigbuilder-10-2026-09-30`, worktree
`~/work/di.iiii-preview-rigbuilder-10`) so the owner can look at every open MOXIR line together on his
own install before anything lands. It was made from `origin/dev` (37ca97b2) with a merge per line, no squash.

- Merged, in this order: #665 the cut's patch (with #659, the show patch, under it) · #664 the cut · #661
  the halo · #662 the X lying down · #663 hall 09-29 (crane measured: bridge underside 7.95 m, was 8.15)
  · #666 smart view · #660 beams in haze · #667 the cue layer is LTP. #644 (the visualiser) is under #659,
  so it came with it. Nothing the installed rigbuilder.9 carries is missing: every commit of `feat/light-visualiser`
  is here, and the files differing from the .9 tree are the branches' own edits.
- The X-lamp bug ("Red room" and "One shaft" showed the 6 X PARs lit though the desk sends them 0):
  found and fixed on its own branch first (#667, `fix/cue-list-ltp`). The room decodes the dimmer
  correctly. The desk's cue layer merged intensity HTP, so the fixture's stored 255 beat the look's 0. The
  cue layer is now LTP (a console's cue-list rule). Guard in `test-cues.js`, seen red without the fix.
- Conflicts and how they were settled: the cut and the halo each modelled UP-COB200 (one kept: the cut's
  `cob200`, and the X's class points at it; the type library regenerated so it carries the 4ch-assumed list);
  `rig-lib` and `versions.mjs` carry the slope, the halo and crane-x side by side; `allVersions` is the versions,
  the halo's variants and the X's candidates, and a variant keeps its own looks while a candidate re-aims the
  set's; `load-version` and `show-loop` keep both flags each (`--hall-from`/`--no-mark-from`,
  `--document-only`/`--doc-only`); realism's `SpotLightObject` was merged with the visualiser's strobe, and the
  physical beam now flashes with the desk's strobe as well; the realism doc section became §20 (the
  visualiser holds §18). Regenerated rig files differ from the branches' own only in `order` and the COB
  kind: every aim and position is identical.
- Added here: `scripts/rigbuild/copy-version.mjs` (RIG_BUILD §15.11): a version kept as a labelled copy.
  Four tests written against another branch's earlier state were brought to the merged set (hall-crane,
  halo, xflat ×2), and `test:raw` carries `rigbuild/dmxPose`.
- Tests: the whole `npx vitest run` gave 647 files passed, 8 failed; after the fixes above, the 3 real ones
  pass and 5 fail. Those 5 (`kitCatalogue`, `di/openFile`, `sdk/door` ×2, `sdk/sdk`) fail the same on
  untouched origin/dev in this machine's shared `node_modules` (version strings): environmental. Lint: 0 errors.
- Backup, before any data change: `~/di-backups/preview-rig-builder-2026-09-28/steps/20260930-004823-rigbuilder10/`
  (`moxir-before-rigbuilder10.diiii` from `di save moxir`, the desk tar, SHA256SUMS, all verified).
- HOLD, the owner's word 2026-09-30: he wants to see the current versions before anything on his screen
  changes. So NOT yet done: installing 0.4.16-rigbuilder.10 (old install kept for rollback, one command
  written down first) and swapping hall v4 into every version with a re-hang. The old-hall copies
  ("· old hall 09-29", `moxir-oldhall-copies.sh`) are made first and change no original.
- Next, on "go": pack + install rigbuilder.10 the way .9 was; point `HALL=` at
  `/mnt/data/footage/place-moxir-hall-v4-0929-crane-dj/hall.json`; swap `place-hall`'s asset
  (hall-night.glb for minimal/halo/cut-movers/halo-heads, hall-show.glb for the X versions, `upsertAsset`);
  re-hang each through its script (trims stay absolute: the cut's truss stays at 6 m); report the X's
  clearance over the press (5.6 m) on the 7.95 m bridge; look at all five cues of every version on the GPU.
