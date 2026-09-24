## 2026-09-24 — a replace says what it removes, and refuses media loss nobody counted

- The incident (2026-09-16 → 09-18): `main-dii-project` held 76 `image` entities, the
  studio's portfolio deck. An audit sampled one file, called them debris and deleted them
  on local+dev. Two days later `project-pull.mjs <pid> --force` carried dev's copy to prod
  as one whole-document `replaceDocument`: 76 slides gone, the tool printed "ok", and the
  owner had approved "carry main front room" without being told.
- `shared/documentLoss.cjs` (pure, CommonJS, read by the server and the scripts): target vs
  incoming over `entities`, `nodes` and scene `objects`. Names what is REMOVED (by type and
  name), which of it is media (image/video/audio/model, or anything carrying an asset
  id/ref/URL), what points at a different file, and a media item that kept its file under a
  new id (not counted as lost). The pattern is plan-then-confirm (`terraform plan`, `rsync
  --dry-run --delete`, `git push --force-with-lease`): the acknowledgement is a NUMBER.
- Guarded, each printing the summary before writing, refusing media loss unless
  `--accept-loss <N>` equals the exact count (wrong or stale N refuses again), `--dry-run`
  printing and writing nothing, non-media removals printed and never blocked:
  `project-pull.mjs` (and `local-mirror.mjs` through it), `tier-sync.mjs` (N is the run's
  total; every overwrite is read before anything is written, and the documents counted are
  the ones written), `space-push.mjs` (scene), `space-bundle.mjs import --force` (projects
  in the file, `--prune` deletions, the scene; `--dry-run` added; `di open --force
  --accept-loss N` and `sync-space-to-dev.sh --accept-loss N` pass it through), and
  `npm run send` → `space-proposal.mjs` → the proposal server: the loss sits first in the
  approver's summary, a file that removes media is 409 `media_loss` without `acceptLoss`,
  and Apply re-counts (the count is bound into the intent hash).
- `install-bundle.mjs` (the `di restore --yes` estate restore) prints the loss per space and
  does not block — it restores a whole point in time the person already confirmed.
- Not guarded, and why: `space-sync.mjs` is a merge (it spreads the document it read and
  sets only presentation/publish state — entities pass through), and it is vendored as a
  single file into three repos, so it must not import a sibling; `project-move.mjs` moves a
  project whole and replaces nothing.
- Server, actor: already recorded on every whole replace — `PUT /api/projects/:id/document`
  (op row actor + restore point, guarded by httpContracts "stamps the author from the
  session on every write path"), restore, proposal apply, sync pull. What surfaced as
  "clientId server" was the op JSON; the author lives in the row. The one authorless door
  was a hand-run `space-bundle.mjs import --force` (and `di open --force`, which stops the
  server first): it now stamps its op rows `server:space-bundle-import` with the machine
  account. An unforced import still leaves them for the HTTP route to stamp with the person.
- Red first, on the unguarded code (each tool swapped back to `HEAD` for the run):
  `scripts/project-pull.test.js` 5/5 red; tier-sync loss block 3/4 red (the exact-number
  case passes unguarded, as it should — it writes); space-bundle loss block 4/4 red;
  space-push loss block 3/3 red; proposal loss contract 1/1 red (`summary.mediaLost`
  undefined). All green after.
- Rule added: golden_rules "Authored media is never judged debris from a sample"; row in
  known-fixes; CONTRIBUTING and the wiki's history entry say it.
- Owed: the 76 slides themselves are not restored by this branch — that is a data action on
  prod (restore point or bundle), the owner's call, not done here. No tier was touched.
