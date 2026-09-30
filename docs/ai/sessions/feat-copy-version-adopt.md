## 2026-09-30 — copy-version --adopt: give a labelled copy its version mark back

Branch `feat/copy-version-adopt`, made from `origin/preview/rigbuilder-11-2026-09-30`. Code and tests only. The
tool has NOT been run against any install and no API was called while writing it.

**The problem (measured 2026-09-30 by the owner on his install).** Six labelled copies made by
`scripts/rigbuild/copy-version.mjs` (`… · old hall 09-29`, project ids `<version>-oldhall-0929`) lost their
`rigVariant.copyOf`; two of the six (the X lying down) have no version mark at all. `--undo` refuses a copy
without `copyOf` (correct), and a mark cannot be repaired in place, so the copies could not be recreated or
folded in the version row (which folds a copy only when its mark carries `copyOf`, `RigVersionSwitch.jsx`).

**What was added.** `--adopt --from <source id> --to <existing copy id> --label "old hall 09-29"
[--suffix oldhall-0929] [--siblings <file>] [--dry-run]`:

- GET only: the copy's and the source's documents. `looksLikeCopyOf(copyDoc, sourceDoc)` (pure) must hold or
  it refuses with the numbers: the marks that exist name the same set; entity counts within 15 % of the
  source's (never tighter than 10); at least 90 % of the copy's hall entities (not `rig-…`, not a piece, the
  definition `load-version.mjs` uses) have the same id AND name in the source. A copy with no hall entities
  is refused, not guessed. `--from` equal to `--to` is refused. **The 15 % and 90 % are chosen, not measured;
  the dry run prints the measured counts for each pair. Owed: read them off the six pairs at the first dry run.**
- The mark is computed as a fresh copy would carry it (`copiedEntities` on the source's mark: id
  `<id>-<suffix>`, the labelled title, `copyOf: { projectId, id, label }`, siblings from `--siblings`). A copy
  that already has a mark keeps its own title and summary (it is a snapshot of the 09-29 hall) and gains
  `copyOf`; a copy with none gets the fresh copy's mark. It refuses when the copy's mark id is not
  `<source mark id>-<suffix>`, when the copy already claims a different origin, when `--siblings` puts the
  copy's entry in another project, when the mark sits on an entity other than `rig-show`, or when there is no
  `rig-show`.
- Writes ONLY `components.rigVariant` of `rig-show`: one `updateComponent` op through `POST
  /api/projects/<copy>/ops`, the route every rigbuild script writes through, at the version it re-read just
  before writing (a second read; the first only plans). No PUT, no DELETE, no asset traffic.
- Idempotent (a copy whose mark already normalises to the wanted one: "nothing to do", nothing written).
  `--dry-run` prints the mark now on the copy (kept for the rollback) and the mark it would write.
- Read back after the write: the mark must have stayed, with `copyOf`; and every other part of the document
  (entities, assets, cues, the rest) must be as it was, or it throws. A server that accepts the op and keeps
  nothing is an error, not silence.

**Finding, from reading the code, not yet seen on the install: the two X copies will NOT come back until
`RIG_VERSIONS_CAP` is raised.** `normalizeRigVariant` (`src/shared/projectSchema.js:858-875`, and the same
constant in `shared/projectSchema.cjs:761`) keeps only the first 8 siblings (`RIG_VERSIONS_CAP = 8`) and
returns null, so the whole mark is dropped, when the mark's own id is not among them. In the 12-entry
`oldhall-0929-siblings.json` the four non-X copies are entries 2, 4, 6 and 8 (kept); the two X copies are
entries 10 and 12 (cut off). That is exactly the pattern the owner measured: no mark at all on the two X
copies, and `copyOf` lost on the other four (a different, since-fixed cause). The `copyOf` fix is on this
branch; the cap is not. So the tool checks before writing, with the same normaliser, and refuses these two
with the reason (own id is sibling 10 of 12; the cap) rather than send an op the server would swallow. Owed,
the real fix: raise `RIG_VERSIONS_CAP` in both files (the set is now 12 projects, with candidates more) and
run `npm run test:schema-sync`; then the same command works for the X copies. A workaround, named as one: a
shorter siblings file for those two copies that lists the copy early. The version row itself is built from the
space's own projects (`setFromRows` in `src/rigbuild/rigVariant.js`), not from a mark's stored siblings, so
a copy folds once its mark exists with `copyOf`; the stored list matters only as the fallback.

**The commands for the owner's session** (read from `~/di-backups/preview-rig-builder-2026-09-28/
moxir-oldhall-copies.sh` and `oldhall-0929-siblings.json`; neither was run or changed). The helper has no
adopt mode, and its default `REPO` (rigbuilder-10) does not have this tool, so run from a checkout of this
branch, e.g. `git worktree add ~/work/di.iiii-copy-version-adopt feat/copy-version-adopt`. Node 22 or newer.

```sh
B=$HOME/di-backups/preview-rig-builder-2026-09-28
REPO=$HOME/work/di.iiii-copy-version-adopt
API=https://local.thedi.studio/serverXR
cd "$REPO"
# 1. the four that fit under the cap: the dry run first, read the numbers, then the same without --dry-run
for p in moxir-hall-minimal moxir-hall-minimal-cut-movers moxir-hall-minimal-halo moxir-hall-minimal-halo-heads; do
  node scripts/rigbuild/copy-version.mjs --api "$API" --token-file "$HOME/.di/di.env" --adopt --from "$p" --to "$p-oldhall-0929" \
    --label "old hall 09-29" --suffix oldhall-0929 --siblings "$B/oldhall-0929-siblings.json" --dry-run
done
for p in moxir-hall-minimal moxir-hall-minimal-cut-movers moxir-hall-minimal-halo moxir-hall-minimal-halo-heads; do
  node scripts/rigbuild/copy-version.mjs --api "$API" --token-file "$HOME/.di/di.env" --adopt --from "$p" --to "$p-oldhall-0929" \
    --label "old hall 09-29" --suffix oldhall-0929 --siblings "$B/oldhall-0929-siblings.json"
done
# 2. the two X copies: the same command with p in "moxir-hall-minimal-xflat moxir-hall-minimal-xflat-heads",
#    only once RIG_VERSIONS_CAP is raised on the install's server (until then it refuses them, writes nothing).
```

`--space moxir` (which the helper passes) is not needed and is ignored by `--adopt`. Each run ends with
`… mark written … read back with copyOf …`, or a refusal or error that says why and exits 1; the copy is then
untouched. After a real run, look at the version row on the owner's own screen: the copies should be folded
behind one entry. That look is owed, it has not been done.

**Rollback.** Each write is one `updateComponent` on one entity. The space was saved before the copies were
made (`steps/20260930-004823-rigbuilder10/` under the same backup directory, the `di save moxir` output):
`di open` that `.diiii` puts the space back as it was then. Care: that save is from before the copies existed,
so opening it restores the whole space to that moment and the six copies go with it (the helper's `copy` mode
makes them again, from whatever the sources are by then). The finer rollback is the copy's previous mark,
printed by every run as `the mark now (kept here for the rollback)`, and the inverse op in the op log. Do NOT
use `--undo` as a rollback: it deletes the copy.

**Tests.** `scripts/rigbuild/copy-version.test.js`: 16 pass (the 3 that were there, 13 new), against a fake
install whose ops route runs the real `normalizeRigVariant`. The new ones: marks a copy without `copyOf`;
builds the mark for a copy with none and compares it to the tool's own fresh-copy mark; refuses a foreign
hall and another set; idempotent; dry run writes nothing; one op, only on `rig-show`'s `rigVariant`, and only
the two documents read; the version re-read right before writing (the write went to version 8 after a bump
from 7); refuses a mark the server would drop (own id not listed, or past the cap); throws when the install
keeps the mark without `copyOf`. Lint clean on the two files. Not done: the guards have not been seen red
against a mutated tool; nothing was run against the six real pairs; `npm run test` and the schema-sync
test were not run (out of the brief's limit).
