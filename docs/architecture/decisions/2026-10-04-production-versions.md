# Decision 2026-10-04 — one version list per production, kept inside the space

Owner, 2026-10-04, approving the design: *"yes and for all future project too"*. Then, on choosing a version for
MOXIR: *"I want to see all first"*.

Code: `src/shared/productionVersions.js` (the data, pure), `scripts/production/` (the tools and the audit),
`src/rigbuild/rigVariant.js` + `RigVersionSwitch.jsx` (the version row). Both schema copies normalise it
(`src/shared/projectSchema.js`, `shared/projectSchema.cjs`).

## The problem, measured

Measured on aylmo, read-only, on the night of 2026-10-04 (the main session's inventory). The map of every copy is
in `~/Downloads/moxir-version-control/map.html`.

- MOXIR (space `moxir`, show 17 Oct) has **17 versions**, each one a project. Two more arrived on dev that night,
  `moxir-hall-known-full` and `-known-ground`, copied from PONYO. dev's `moxir` space holds 22 projects. Three of
  them are not versions: `moxir-sources`, `moxir-brief` and `moxir-truss`.
- Each version carries its own list of the others in `components.rigVariant.siblings` on its show entity. The
  lists were copied when each version was made and never updated. **16 versions show 6 different version rows.**
- Since 2026-09-30 the row has been built from the space's rows (RIG_BUILD.md §15.1). Where the rows carry no
  marks it falls back to each version's own list. The new test `rigVariantList.test.js` builds such a case: on
  origin/dev it shows 6 different rows from 16 versions, and with this change it shows one.
- The code's list, `scripts/place/rigs/moxir-versions-2026-10-17.json`, names 4 of the 17 as the set. It also
  names variants and candidates.
- **Nothing says which version is for the show.** Nothing says which ones are kept copies, which ones are retired,
  or what each one was made from, by whom, or with which commit.
- Copies were moved between machines by hand, so the same name can hold different work. `moxir-hall` is
  different on aylmo, on dev and on PONYO. Nothing compares them.

## The established method

**The asset-publish model of film and animation pipelines.** In Autodesk ShotGrid (now Flow Production
Tracking), a `PublishedFile` is one numbered version of an asset. It records the entity it belongs to, a status
field (`sg_status_list`), its upstream inputs and who made it. A shot or asset points at the one version
approved for use. Pipelines built on Pixar's USD keep the same split: a scene names an asset by a logical path,
an asset resolver (USD's `ArResolver`) turns it into one specific published version, and which version that
is (latest, or approved) is the pipeline's recorded decision. Old versions stay addressable and are never
overwritten.
Two rules come from this model:

1. **A version is a record of its own, with a status and its lineage.** It is not a row each sibling keeps a
   copy of.
2. **There is at most one approved pointer.** "Approved" is a decision a person makes and a tool records. It is
   never derived.

**git's ref model** gives the third rule. A branch or tag is a name pointing at one commit. Refs live in one
place per repository, `git fetch` carries them, and `git fsck` / `git diff` compare copies. Here the list is the
refs file, `di follow` is the fetch, and `versions-audit` is the fsck.

This is not the published model in one respect: **our versions are living projects.** In a pipeline a published
version is immutable. A MOXIR version is a project people keep editing. So each entry's `fingerprint` records
the state it was in when it was listed (or made), and the audit reports "edited since it was listed" as a note,
not an error. Freezing a version for the show (a snapshot with `copy-version.mjs`) remains a deliberate act.

## Options considered

| | Where the list lives | Travels with `di follow`? | Verdict |
|---|---|---|---|
| A | **A project of its own in the space, `<production>-versions`**, one entity per version | Yes. Follow carries every project's op log both ways, makes a project born on one side on the other (`follower.js` `refreshStreams`, born private when private there), and converges on the host's copy (`followConverge.js`). | **Chosen** |
| B | Space-level data (the space's meta) | **No.** `SPEC_follow.md` "Not yet": *space meta* is not carried. | Rejected |
| C | The room's scene (`scene.json`, the space's own log) | Yes, but it is the V1 fossil (vocabulary.md "Deliberate survivors"), its schema is objects in a 3D place, and every edit to the room would share a log with the list. | Rejected |
| D | Keep `rigVariant.siblings` and repair all 17 copies | Each copy drifts again the next time a version is made. This is the cause, not the fix. | Rejected |
| E | One array on one entity | Travels, but two machines adding a version at once each write the whole array, and the host's copy wins, so one addition is lost. | Rejected for D-per-entity |

**Why one entity per version (inside A).** An op touches one entity. If two installs each add a different
version, both arrive. Only two edits to the *same* version at the *same* moment fall to the host's copy. That is
the follow's documented cost (SPEC_follow.md guarantee 2). The rule "at most one for the show" is enforced by
every writer. A merge can still produce two: aylmo and dev could each choose a different one in the same second.
If that happens, every reader treats it as "none chosen". The list reports it as a problem, and `versions-audit`
exits 1.

**Why the project is keyed by production, not by space.** A space may hold more than one production. The place's
twin can host several runs. The production id is the set id the versions already carry (`rigVariant.set`, e.g.
`moxir-2026-10-17`), so the row finds the list from any version. Project ids are global on an install (at most 64
characters), and `moxir-2026-10-17-versions` is 25.

**Why it is born private.** Statuses are the production's own decisions ("the page is not the changelog",
vocabulary.md). Only the space's members can read it. For anyone else the row is exactly what it was before. The
cost: a visitor's viewer makes one request for the list that answers 404.

## The data

The list project holds one entity `production` (component `productionMeta`) and one entity per version,
`version-<id>` (component `productionVersion`):

| field | meaning |
|---|---|
| `id`, `projectId`, `title` | the version (the mark's id), the project it lives in, its name |
| `status` | exactly one of `for-the-show` · `candidate` · `kept-copy` · `concept` · `archived`; at most one `for-the-show`; none is valid |
| `madeFrom` | the version id it was made from, or null |
| `madeBy` | `{ machine, install, tool, commit }` — the machine the tool ran on, the install it wrote to, the tool, the git commit (`+dirty` if the checkout had changes); null where not known |
| `madeAt` | ISO time |
| `fingerprint` | `sha256:` over the document as tier-sync normalises it: `VOLATILE_PATHS` dropped (projectMeta createdAt/updatedAt, …) and every asset addressed by name, not content id (`tier-sync.mjs` `stripVolatile`, `byName` — reused, now exported) |
| `rig` | `{ file, blob }` — the rig file in git it was built from, and its blob as read when made (null if not pinned) |
| `listed` | `{ at, by }` — when and by what the entry was written |
| `note` | plain words: where each fact came from |

Unknown values are null and are never guessed. Both schema copies drop a malformed entry. Old servers keep it
unvalidated, because unknown components pass through `normalizeEntity`, so the list travels to installs that do
not have this code yet.

## Who writes it

**Only tools, and only in the same step that makes a version:**

- `scripts/rigbuild/load-version.mjs`: a new version is a `candidate`, with `madeFrom` from the versions file and
  the rig file pinned by blob. `--mark` lists the version too: if it is already listed, it keeps its making and
  is fingerprinted again.
- `scripts/rigbuild/copy-version.mjs`, run around `main()` so main's own lines (which PR #754 changes for
  `--from-api`) are untouched:
  - a copy is a `kept-copy` made from the source version;
  - a copy brought from another install under its own id is a `candidate`;
  - `--adopt` registers the copy from its mark;
  - `--undo` takes the copy out of the list;
  - `--dry-run` writes no list.
- `scripts/production/versions.mjs` — `list` · `set-status <id> <status>` (refuses a second `for-the-show`) ·
  `register <projectId>` · `put --file` · `remove <id>`; `--dry-run` everywhere.

Every write re-reads the list and sends one ops POST at the version it just read (a 409 re-reads, up to 3
times). It reads the list back and compares, and prints the command that undoes it. The undo file is kept in
`~/.di/versions-undo/`. Writes never use a whole-document PUT, because a follow does not carry those
(`followPlan.js` `WHOLE_WORK_OPS`). If a list write fails after the version is made, it says so and names the
`register` command that finishes the job.

`rigVariant.siblings` is now legacy. The row reads it only when there is no list. No code in this change writes
it. The older writers (load-version's `variantOf`, copy-version's `--siblings`) still write it, because the
normaliser drops a mark whose own id is not in its siblings. Any server before this change would lose the mark.

## Checking it

`scripts/production/versions-audit.mjs` compares the list on each install (dev, the local install, any other)
and the code in git. It works version by version and reports each by name:

- **same**: the same work, by fingerprint, on every install;
- **differs**: different work under one name;
- **missing**: the version is listed, but its project is not on that install;
- **not in list**: a project carries the production's mark but is not listed;
- the lists themselves disagree;
- a version the code names is not listed;
- a rig file is not in git, or has changed in git since it was pinned.

Exit 0 means everything agrees, 1 means a mismatch, 2 means an install could not be read.

**When to run it:**

- after a follow has settled (`di follows` says quiet);
- after every land or deploy to dev, next to the "dev and local stay one" check;
- before the show.

**Owed:** a CI job. The audit needs a token for dev, and a token for the local install, which CI cannot reach
anyway. So CI wiring means a dev-token secret and a dev-only run. Until then, the main session runs it by hand
after each land, as an ordinary step.

## The one-time MOXIR build

`scripts/production/build-moxir-versions.mjs` (`--dry-run` reads only). It derives each entry from the project's
own mark and row and from the code's versions file (`derive.mjs`):

- **`archived`** where the project's row says archived;
- **`kept-copy`** where its mark is a copy of another project (the six `*-oldhall-0929`);
- **`candidate`** otherwise, including the two from PONYO, whose mark is a copy of itself because
  `copy-version --from-api` writes `from == to`;
- **no `for-the-show`**.

It refuses, and writes nothing, in two cases: two projects claim one version id, or an `*-oldhall-0929` lost
its `copyOf`. Run it on the hub (dev). Every install that follows `moxir` then receives the list with the
space. **This change does not run it.**

## Concept (added 2026-10-04, owner: "keep the others as concept, take only the good ones and concentrate on the new setup")

A fifth status. A **concept** is a version kept on purpose as an idea: never deleted, not on the main row, folded
under ONE button "Concepts (n)" on the version row, reachable in one click. It is not archived (an archived
version is not on the row at all) and not a kept copy (a labelled copy of an old state, folded under "Old
versions (n)", which keeps its own fold). The version for the show is first on the row; a concept you are
standing in is never folded. The audit treats a concept like any listed version (same checks, its status is
printed). Order in the list: for-the-show, candidate, kept-copy, concept, archived.

- `versions.mjs set-status <id> concept` and `set-status --all-except <id,id,...> concept [--dry-run]`. The bulk
  form moves the listed **candidates** that are not named; it leaves kept copies and archived versions as they
  are, and it refuses, writing nothing, when the version for the show is not named in the except list or an
  id is not in the list. Each version is one write with its own read-back and printed undo.
- **Older installs.** Code from before this change does not know the word. Measured on origin/dev 7a751cf3:
  `normalizeProductionVersion` returns null for an unknown status, so the entry is dropped from that install's
  reading of the list (the row, `list`, the audit): a concept is simply not on an old install's row, and can
  never appear as a candidate or for the show. The server's normaliser does the same to the component when it
  normalises a whole document (`drops a malformed entry at the server`), so an OLD server can lose the concept
  entry from its own copy. That is why the order is: land and deploy this to dev, update every install
  (`di update --from`), and only then run `set-status ... concept` on dev. If an old install did lose an
  entry, `di follow` brings it back from dev (dev is the hub), and the audit reports "the list does not have it".
  Unknown statuses are deliberately not coerced to a guess (a guess could promote a hidden version to the main
  row).

## Limits

- **Measured in tests only.** Every claim here holds against an in-memory install that runs the server's own
  schema (`fakeInstall.testlib.mjs`). None has been run against dev, aylmo or PONYO.
- **Fingerprint stability across real installs is not yet measured.** The normalisation is tier-sync's, which
  was measured on its first run: of 155 differences reported, 138 were only the two timestamps. A project
  whose title differs between installs, or other per-install fields not yet known, would read as "differs".
- **`madeAt` for the 19 existing versions** is the install's `createdAt`, which is when that install first held
  the project. For a project carried by a follow or copied in, that is its arrival, and the entry's note says so.
  The machine and commit that made them are not known (null).
- **Concurrent status edits** on two machines in the same second: the host's copy wins. Two `for-the-show` can
  only come from a merge, and the readers and the audit name it.
- **A visitor** (not a member) never sees the list, by design.
- **The follow engine does not carry project deletion** (SPEC_follow.md). That is why `remove` is an op on the
  list, never a deletion of the list's project.
