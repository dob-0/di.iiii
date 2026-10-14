# MOXIR Known · full (flipped cut): build rehearsal on scratch, 2026-10-07

What this is: the exact commands that built the **Known · full** version of the MOXIR show (the cut hung
**flipped**, high end house left, plus Emilya's safety fixes; draft PR #816, branch
`feat/moxir-truss-flip-2026-10-07` at `e9f0703e`) into a throwaway di.iiii stack, so the owner can walk it
before anything touches dev. It is also the rehearsal of the same build on dev. Nothing was written to dev
or to the installed di on aylmo: the installed di (`https://local.thedi.studio/serverXR`) was only read
with GET, and every write went to the scratch serverXR on `127.0.0.1:4323`.

Method: RIG_BUILD.md §15 (versions as projects) and §15.11 (copies), using the repo's own scripts. No
document was edited by hand.

## Where it runs

| what | value |
|---|---|
| tree | `moxir-flip` → `~/work/di.iiii-moxir-flip` |
| web | http://moxir-flip.dii.localhost/ (also http://127.0.0.1:5335/) |
| scratch serverXR | `http://127.0.0.1:4323/serverXR`, data `~/.cache/di-dev/moxir-flip/data` |
| the owner opens | **http://moxir-flip.dii.localhost/moxir** |

The stack was started without `--keep`, so it does not come back after a logout or reboot. To restart it:
`di-dev up moxir-flip --api scratch`. The scratch data stays until `di-dev down moxir-flip --wipe`.

## The commands, in order

`$SCR` below is a session scratchpad folder outside the repo
(`/tmp/claude-1000/-home-dob/<session>/scratchpad/rehearsal`). Run everything from the worktree root.

### 1. Start the scratch stack

```sh
di-dev up moxir-flip --api scratch
di-dev ls            # moxir-flip  scratch  web :5335  api :4323
```

This starts vite and a serverXR of its own on scratch data. The scratch serverXR runs with
`NODE_ENV=development` and no `REQUIRE_AUTH`, so it takes writes with no token. The scripts still insist
on a `--token-file`, so they get a **dummy** one. That keeps every real key off the command line. The
installed di's GETs need no token either.

```sh
mkdir -p "$SCR"
printf 'ADMIN_API_TOKEN=scratch-dummy-not-a-key\n' > "$SCR/scratch.env"; chmod 600 "$SCR/scratch.env"
```

### 2. Create the space `moxir` on scratch

`scripts/space-new.mjs` was **not** used. It writes to the live server by default (`di-studio.xyz`) and
writes a tracked file into the repo's `spaces/` folder. One API call does the job and touches nothing else:

```sh
curl -s -X POST -H 'content-type: application/json' \
  -d '{"id":"moxir","label":"MOXIR"}' http://127.0.0.1:4323/serverXR/api/spaces
```

(The installed di's space has the label `moxir`. The scratch one says `MOXIR`, and nothing reads it.)

### 3. Copy the hall's project from the installed di (read only there)

```sh
node scripts/rigbuild/copy-version.mjs \
  --api http://127.0.0.1:4323/serverXR --token-file "$SCR/scratch.env" \
  --from-api https://local.thedi.studio/serverXR --from-token-file "$SCR/scratch.env" \
  --space moxir --from moxir-hall --to moxir-hall --label "local 10-07"
```

Result: `moxir-hall on https://local.thedi.studio/serverXR (version 2379, 24 entities, 4 assets) →
moxir-hall "MOXIR — the hall · local 10-07"`. The 4 assets came across: hall.glb 3 505 876 B,
rig-beams.glb, rig-wash.glb and rig-fixtures.glb. The source was only read.

**The copy's id must be `moxir-hall`.** load-version names the new project `<--from>-<version>`
(`projectOf` in `scripts/rigbuild/versions.mjs`), and it has no `--to`. A copy named
`moxir-hall-local-1007` would produce `moxir-hall-local-1007-known-full`. I made that copy first, with
the same command and `--to moxir-hall-local-1007`, and it is still on scratch, unused. To remove it:
`copy-version.mjs … --undo --to moxir-hall-local-1007`.

### 4. Build the version's typed document and check the generated files

```sh
node scripts/rigbuild/versions.mjs --check                                   # "the version files are current"
node scripts/rigbuild/versions.mjs --report "$SCR/report" --only known-full
```

`--report` also rewrites the generated rig and rental files. They came out byte-identical, and
`git status` stayed clean. The report said: `known-full 74 lamps · 31.9 kW · U 1:512ch 2:176ch ·
patched 68/84`. It wrote `$SCR/report/known-full/{report.json, patch-sheet.html, patch.csv, power.csv,
known-full.document.json}`.

### 5. Load the version into its own project

```sh
node scripts/rigbuild/load-version.mjs \
  --api http://127.0.0.1:4323/serverXR --token-file "$SCR/scratch.env" \
  --space moxir --from moxir-hall --version known-full --report "$SCR/report" \
  --hall scripts/place/rigs/moxir-hall-2026-10-02-crane-dj.hall.json --no-mark-from
```

Result: it created `moxir-hall-known-full` with the venue plan (100 columns, 3 zones), 7 pieces and 118
rig entities, and the project reached version 129. It then wrote the show entity (equipment list of 5
lines, 25 looks, the `rigVariant` "known-full" of `moxir-2026-10-17`), version 132, default look
`k-monolith`. It also made the version list `moxir-2026-10-17-versions` (private) and listed known-full
there as a **candidate**. `--no-mark-from` left `moxir-hall` itself unmarked. Undo the listing with
`node scripts/production/versions.mjs --api … --token-file … --production moxir-2026-10-17 remove known-full`.

### 6. Set the space's front door

```sh
curl -s -X PATCH -H 'content-type: application/json' \
  -d '{"publishedProjectId":"moxir-hall-known-full"}' http://127.0.0.1:4323/serverXR/api/spaces/moxir
```

Read back: `publishedProjectId = moxir-hall-known-full`. Both `http://127.0.0.1:5335/moxir` and
`http://moxir-flip.dii.localhost/moxir` answer 200.

### 7. Check the result from the document, not from a render

```sh
curl -s http://127.0.0.1:4323/serverXR/api/projects/moxir-hall-known-full/document > "$SCR/known-full.scratch.json"
```

The document has 127 entities. The checks:

- **The truss line slopes the flipped way.** It is 4 × `truss-3m` pieces (`rig-line-1..4`), each turned
  −15.0° about z, with centres from (−4.105, 6.110) to (4.588, 3.780) at z 4.8. The section is 0.29 m
  (`TRUSS_SECTION_M`).
  - High end, house left: centreline end (−5.554, 6.498). The bottom chord there is at **6.353 m**
    (vertical half-section), or (−5.591, 6.358) along the truss's own axis.
  - Low end, house right: centreline end (6.037, 3.392). The bottom chord there is at **3.247 m**, or
    (5.999, 3.252) along the axis.
  - These match the brief (high x≈−5.55 at ≈6.35 m, low x≈6.04 at ≈3.24 m).
- **Lamps by class:** `up-pl5403` **50**, `up-b380f` **18**, `ext-lc-ultra-mk2` (LaserCube) **6**, 74 with
  light in all. The effects with no light are 6 `ext-hazer` and 4 `up-yz31p` smoke machines.
- **Tie-offs (2):**
  - `rig-tieoff-hl` at (−5.554, 6.498): the HIGH end, house left, to the nave column at x −11.6.
  - `rig-tieoff-hr` at (6.037, 3.392): the LOW end, house right, to the nave column at x +11.6.
- **Picks (3):** a chain hoist at each of u −5.25 / 0.5 / 5.75 m (x −5.034 / 0.520 / 5.592). Each pick has
  2 bridle legs, 2 beam clamps, a chain, a safety steel and the steel's own clamp. The clamps sit at 7.8 m.
- **Against the report:** all 118 entities that the report document and the scratch document share have
  identical transforms. The report's two placeholder boxes (`rig-stage-deck`, `rig-truss-header`) are
  replaced in the project by the real pieces (`rig-deck-1..3`, `rig-line-1..4`).

The 3D room was **not** rendered or screenshotted, by rule: headless WebGL froze this machine at 100 °C.
The owner's look in his browser is still owed.

## Running it on dev (not done here)

The same order applies with `--api https://dev.diiii.xyz/serverXR` and the dev token file, and with no
`--from-api` (the hall's project is already on dev). The front door is set the same way or in the space's
settings. Two things to decide first:

1. Dev already holds a `moxir-hall-known-full` (the PONYO 10-04 copy). Keep that as a labelled copy first
   (`copy-version.mjs --to moxir-hall-known-full-ponyo-1004 --label "PONYO 10-04"`). Then read how
   load-version's create step treats a project that already exists before running it.
2. The owner says whether known-full is listed as a candidate or the chosen version.

After that, the installed di on aylmo follows dev (the "dev and local stay one" rule).

Session note, 2026-10-07: rehearsal run by an agent. All writes went to scratch `127.0.0.1:4323` only, and
local was read with GET only. The scratch stack is left running.
