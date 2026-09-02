## 2026-09-03 — dev absorbs main so the promotion can go

The dev → main promotion (#284) had turned CONFLICTING. Not on new work: the suite/brand
pages were committed straight to `main` (#300, 05:40) and separately to `dev` as PRs
(#305/#307, 17:10 and 18:06) that went on to add the studio's third person. The two copies
collided add/add in `public/suite/index.html` and `serverXR/src/routes/ogRoutes.js`.

Resolution: `dev`'s copy on both files — the newer superset, three people not two. `main`'s
other commits (earlier promotion merges, the nginx redirect fixes, the README wordmark) come
across untouched. After this merge `origin/main ← dev` is clean, and #284 carries the other
session's #306 (four cherry-picks already on dev), which closes as superseded.

The lesson is the one the one-copy rule already states: a page committed to `main` directly
and to `dev` separately is two copies, and the next promotion has to choose.
