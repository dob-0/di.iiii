# land/sync-versions-moxir-2026-10-04


## What landed and how
One batch of six PRs, on the owner's "go merge" (2026-10-04), so dev's required checks run once (branches must be up to
date; #750 had already merged as 6615ffaa and put the rest BEHIND).

- **In it:** #751 (follow CLI safety), #752 (empty projects both ways), #749 (shelf routes space scope, plus the audit doc it
  cites), #753 (add-sources), #754 (6 LaserCube Ultra MK2; copy from another install), #756 (production version list).
- **Conflicts resolved by keeping both sides:** `docs/ai/known-fixes.md` (new rows from #749, #750, #752) and
  `serverXR/src/follow/followIntegration.test.js` (#750's and #752's new describe blocks, joined at their shared close).
  Follow suite after the join: 8 files, 80 tests passed (aylmo, 2026-10-04).
- **Not in it:** #745 (Lite by default; waits for the owner's own merge word) and #757 (follow from now, F4; rebases on
  this batch once it lands — conflicts expected in follower.js / followStore.js / cli.mjs).
- **After merge:** the six PRs close as merged; dev deploys; aylmo installs the same commit (owner's rule "dev and local stay one").
