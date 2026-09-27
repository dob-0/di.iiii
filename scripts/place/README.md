# place — footage of a hall in, a room you can walk out

One command turns a folder of photographs and video of a venue into a space on
di.iiii: the hall standing still on its floor, at the right size, with a door
you arrive at, and the footage it was built from kept beside it.

Why it works this way, and what the pipeline is for:
[`docs/architecture/PLACE.md`](../../docs/architecture/PLACE.md).

## The one command

```bash
node scripts/place/place.mjs \
    --from /mnt/data/footage/moxir-2026-10-17 \
    --name moxir \
    --scale-edge 24
```

…or, for a walk a phone already collected at `/{space}/scan`:

```bash
node scripts/place/place.mjs --from-space moxir --name moxir --scale-edge 24
```

`--from-space` pulls that space's own `sources` room back down over the API and
implies `--no-sources`: the phone hung those pictures on that wall as it walked,
and carrying them in again would leave two of every photograph in one room. Use
it when the space lives somewhere else — a factory walked against the dev tier,
the copy built at home — and `--api` to say where.

On the studio machine the same thing is one button: **Make the hall**, on the
scanning page itself. See [`docs/architecture/PLACE.md`](../../docs/architecture/PLACE.md)
→ *Scanning from the platform*.

`--scale-edge 24` is the only thing the machine cannot work out: **measure one
wall of the hall with a tape and type the number.** Without it, use
`--door-guess` and the pipeline calls the tallest doorway 2.1 m — and says, in
every place it can, that the size is a GUESS.

It takes about an hour, nearly all of it the reconstruction. When it finishes
it prints the addresses to walk.

## Before the first run

**Colab must be signed in**, once, by a person with a browser:

```bash
colab sessions        # follow the link it prints, paste the code back
```

If the CLI errors on `KernelClient`, reinstall it — version 1.0.2 of
`jupyter-kernel-client` renamed that class:

```bash
uv tool install --force google-colab-cli --with 'jupyter-kernel-client<1'
```

**Python with opencv, numpy and trimesh.** The pipeline finds it by itself if
`python3` has them; otherwise name one:

```bash
PLACE_PYTHON=/home/dob/tools/ComfyUI/.venv/bin/python node scripts/place/place.mjs …
```

**Blender** is used to read the OBJ Meshroom returns. **ffmpeg** pulls frames
out of video. Both are expected on the PATH.

**A di.iiii to import into.** The default is the local one at
`https://local.thedi.studio/serverXR`; `--api` points somewhere else. The API
token is read from `DI_API_TOKEN`, from `--token-file <env file>`, or from
`~/.di/di.env` / `serverXR/.env.local`. It is never printed.

## The five steps, on their own

Every step writes into one working folder and can be run again by itself. Use
`--from-step <n>` to carry on from where it stopped.

```bash
# 1 — footage in, usable frames out
node scripts/place/frames.mjs --from <footage> --work <work>
node scripts/place/frames.mjs --from-space moxir --work <work>   # a phone's walk, pulled down

# 2 — frames to a rented GPU, mesh back
node scripts/place/colab-job.mjs --work <work> --gpu L4
node scripts/place/colab-job.mjs --work <work> --dry-run         # just the commands
node scripts/place/colab-job.mjs --work <work> --local-obj a.obj # no GPU at all
node scripts/place/colab-job.mjs --work <work> --gpu local        # Meshroom on THIS machine

# 3 — a reconstruction is not a model
node scripts/place/crush.mjs --work <work>

# 4 — floor flat, a metre a metre
node scripts/place/fit.mjs --work <work> --scale-edge 24
node scripts/place/fit.mjs --work <work> --door-guess --flip

# 5 — the room arrives on di.iiii
node scripts/place/import.mjs --work <work> --name moxir
node scripts/place/import.mjs --work <work> --name moxir --no-sources  # footage already there
```

What ends up in the working folder:

| file | what it is |
| --- | --- |
| `images/` | the frames the reconstruction actually used |
| `frames.json` | how many were kept, how many thrown out, and why |
| `mesh/` | what came back from the GPU: the OBJ and its textures |
| `raw.glb` | that mesh, converted, before any crushing |
| `place.glb` | crushed: ≤ 300k triangles, WebP textures, meshopt |
| `crush-before.png` · `crush-after.png` | **open these** — the crushing, looked at |
| `place.json` | the fit: size, transform, spawn, walkable floor, and how the size was decided |
| `place-fitted.glb` | the room as it ships, standing upright on its own floor |
| `import.json` | where it went and the addresses to walk |
| `pulled/` | only with `--from-space`: the footage as it came down off the API |

## Looking at the scanning page

Three defects in `/{space}/scan` were found only by driving it, and none of them
would have failed a test. So there is a driver:

```bash
# your own dev stack first — NEVER 4000, 443 or 80
PORT=5150 DI_LOCAL=1 CLIENT_DIR=./dist DATA_ROOT=/tmp/scan node serverXR/src/index.js

node scripts/place/scan-drive.mjs my-proof --base http://127.0.0.1:5150
```

It makes a space, opens the camera on it with a synthetic stream that has real
edges in it, records two pieces, takes three photographs, measures a wall, and
walks the footage room — at 390x844 and 844x390, `deviceScaleFactor: 3`, both
orientations — leaving numbered screenshots in `~/Downloads/place-scan/`.

**Open them.** A screenshot nobody looked at is not verification.

## No footage yet? Make a hall

```bash
blender -b -P scripts/place/testroom.py -- /tmp/place/testroom.obj
node scripts/place/place.mjs --from /tmp/place --name place-test \
    --local-obj /tmp/place/testroom.obj --scale-edge 8.3 --edge width --from-step 2
```

A room 8 × 6 m and 3 m high with a 2.1 m doorway, a column, a stage and a
table, at about 400k triangles — then tilted, spun and scaled to nothing like
life size, which is the mess the fitter exists to undo.

## When the footage cannot make the hall: model it, then hang the rig

A scan needs footage that covers the room. When it does not — MOXIR, 2026-09:
67 frames gave a smeared roof fragment and the venue could not be walked again —
the fallback is the one set designers and lighting designers use anyway: a clean
box model of the room from its structural grid, with every number that was not
taped labelled as such, and the rig hung in it by rule.

```bash
# 1 — the hall: a parametric Soviet single-span crane hall (Blender, headless)
blender -b -P scripts/place/hall.py -- --out /mnt/data/footage/place-moxir-hall \
    --dims scripts/place/rigs/moxir-hall-dims-2026-09-27.json \
    --dims scripts/place/rigs/moxir-hall-features-2026-09-27.json --preview

# 2 — it becomes the room of the space (the footage wall is left alone)
node scripts/place/import.mjs --work /mnt/data/footage/place-moxir-hall \
    --name moxir --no-sources --replace --title "MOXIR — the hall"

# 3 — the rig, from a rig file, against the hall's grid
node scripts/place/rig.mjs --rig scripts/place/rigs/moxir-2026-10-17.json \
    --hall /mnt/data/footage/place-moxir-hall/hall.json --project moxir-hall

# 4 — look at it on the GPU, and count frames, draw calls and triangles
node scripts/place/rig-look.mjs --gpu --base https://local.thedi.studio \
    --hall /mnt/data/footage/place-moxir-hall/hall.json \
    --rig scripts/place/rigs/moxir-2026-10-17.json --out ~/Downloads/moxir-hall --tag look \
    --views door,mid,stage,close   # close = one close-up per fixture kind
```

Take the rig down again: `node scripts/place/rig.mjs --project moxir-hall --remove`.
Every rig entity's id starts `rig-`; a re-run deletes those first and touches
nothing else except the night (ambient, fog, background) and the shadow switch.

**`hall.py`** builds, in real metres, grouped into eight meshes by material:
the floor with rail tracks, two rows of stepped columns with crane consoles,
runway beams with walkways and handrails, one or more yellow crane bridges,
a Warren truss per grid line, purlins, a skylight lantern, clerestory bands,
optional low side aisles, end walls with gates and an entry platform. With no
`--dims` it uses PLACEHOLDER dimensions and says so; `--dims` files merge in
order, and `hall.json` records, for every value, the file it came from, its
range and its confidence. `place.json` only says `measured` when a dims file
says its source is a tape. Frame: Y up, the entry at +Z, the far end at −Z.

The MOXIR numbers (`rigs/moxir-hall-dims-2026-09-27.json`) were estimated from
the photographs — VGGT on 55 frames, scale from a perspective fit of the
column rows, snapped to the GOST 23838-89 grid (24 m span, 6 m pitch). Crane
rail 7.6 m is disputed (6.6–8.4). The features file (gates, aisles, the two
cranes) is read off the pictures; its sizes are guesses. Nobody has taped the
hall.

**`rig.mjs` / `rig-lib.mjs`** place each group by a named rule against the grid
(`stage-back`, `truss-header`, `column-uplight`, `crane-bridge`, …) and aim it
at a named target, converting to the same pan/tilt the inspector shows
(`src/project/viewport/spotLightAim.js`). Two checks run on every aim: a laser
must be hung at least 3 m up and must not descend (refused otherwise), and any
beam whose axis runs into a crane girder is reported — a laser into steel is
refused. Positions follow the hall, so rebuilding the hall moves the rig.

### The fixtures: identified, modelled, posed

**Who made them.** The rental house's codes UP-B380F, UP-250BSW, UP-HK1915 and
UP-PL5403 are **UPlight** (Guangzhou) models — the code is printed on the maker's
own pages (pro-uplight.com, up-light.en.made-in-china.com). UP-LA40WF, UP-Q108S,
UP-YH600F and UP-YZ31P are not UPlight products anywhere; they are modelled on
named equivalents until the rental house says what they are.
`fixtures/fixtures.json` is the manifest: for every fixture every number
(size, weight, source, beam/zoom, pan/tilt, DMX, IP, power, photometry) is
`{ value, src, basis }` — `src` a URL in `sources`, `basis` EXACT, EQUIVALENT
or ASSUMED. `fixtures.test.js` fails on a number with no source.

**The models.** No licensable model exists: GDTF Share (DIN SPEC 15800) needs
an account and its terms forbid derivative and commercial use; Open Fixture
Library has DMX modes and dimensions but no geometry. So each fixture is
built here, headless in Blender, to the datasheet box and the maker's photos:

```bash
blender -b -P scripts/place/fixtures/build_fixtures.py -- \
    --manifest scripts/place/fixtures/fixtures.json --out scripts/place/fixtures/glb --preview
```

Each GLB has separate nodes `Base` / `Yoke` (origin on the pan axis) / `Head`
(origin on the tilt axis) / `Lens` (the emitting faces), 100–1,100 triangles;
the sidecar `glb/<kind>.json` records the pivots, the size at home position,
its deviation from the datasheet (every axis within 10 %), the triangle count
and the script's hash (a stale GLB fails the test). Licence: the repository's
(AGPL-3.0). `glb/preview/*.png` is what each looks like.

**Posed.** `fixture-lib.mjs` is the machine: pan turns the yoke, tilt the head,
the beam leaves the lens; a hung fixture is the same machine upside down. An
aim is solved from the tilt pivot, so the beam passes exactly through its
target; the spot light entity is written AT the lens and its cone is cut where
the beam meets the building (floor, roof pitch, lantern, walls). An aim past
the head's tilt travel is reported. `fixtures-glb.mjs` writes every part of
every fixture as one `EXT_mesh_gpu_instancing` node — the whole rig's bodies
are one 226 KB file and ~45 instanced draws, the lens tinted per lamp. The
named price: the bodies are posed when rig.mjs runs; re-aiming a lamp by hand
in the Studio moves its beam, not its head (a fixture component that follows
the inspector is owed).

### Photometry

No UPlight page publishes lux or lumens, so every figure is a maker's claim
for a named equivalent (in the manifest, with its source and a cross-check):
380 W beam 125,500 lx @ 20 m at 1.8° (SHEHDS GalaxyJet; Elation Proteus Hybrid
agrees within 4 %), 250 W LED spot 14,557 lx @ 5 m at 13° (Chauvet 475ZX),
19×15 W bee-eye 14,000 lx @ 5 m at 4° (LIRO LR-L1915Z), 54×3 W PAR 11,000 lx @
1 m at an assumed 25° (Colorful Stage). The method (`rig-lib.mjs`, PHOTOMETRY):

- candela I = E·d² (inverse-square, far field) — or flux / beam solid angle,
  Ω = 2π(1 − cos θ/2), when only lumens exist;
- a zoom keeps its flux: I scales with Ω(datasheet angle) / Ω(angle used);
- three.js (r155+) takes a SpotLight's intensity in candela; the rig multiplies
  every lamp by ONE `photometry.sceneScale` — the exposure is a choice, the
  ratios between fixtures are the datasheets';
- a beam's brightness in haze goes as I·tan(θ/2) (illuminance through its
  cross-section); a display cannot show that 200:1 range, so it is compressed
  with exponent 1/3 (Stevens' brightness law, as in Tumblin & Rushmeier's tone
  reproduction, 1993) — order kept, absolute ratios not — into each lamp's `haze`.

### Looks — focus palettes, not scatter

Positions are the rig's; aims and colours are a **look** (`looks` in the rig
file), written the way a lighting designer writes focus palettes, in the
stage's frame and symmetric by construction:

| look | what it is |
| --- | --- |
| `roof-cathedral` (default) | column-base beams straight up into the trusses in mirrored pairs, a slight lean to the centre line; stage beams an apse fan into the lantern |
| `fan-out` | the stage beams one symmetric fan over the house; the column rows lean back to the stage |
| `crossfire` | the column rows fire across the floor, crossing over its centre at ~5 m; stage beams X-cross |
| `all-to-centre` | every beam to one point 9 m above the crowd, 16 m out from the stage |
| `curtain` | stage beams and bee-eyes straight up in two rows, truss spots straight down: a wall of light at the stage line |

```bash
node scripts/place/rig.mjs --rig scripts/place/rigs/moxir-2026-10-17.json \
    --hall <work>/hall.json --project moxir-hall --look crossfire   # --look list
```

Aim rules: `vertical`, `parallel`, `fan`, `point`, `mirror-point`, `cross`,
`x-cross`, `up-the-column`, `stage-wash`, `down-from-crane`, `laser-into-roof`.
`rig-lib.test.js` holds every look to: nothing refused, no beam into a crane,
no head past its travel, and **every lamp has a mirror twin** (position and
beam) — the test that fails on a scatter.

### The rig: a real ceiling, measured

A browser cannot run ~90 real three.js spot lights. Each is a term in every lit
pixel's shader, and with shadows on each needs its own shadow render and a
texture unit — WebGL gives 16 to 32. So every fixture draws its beam cone, and
a **budget** of 8 lamps also lights the room; the rest are `beam.only`
(`components.beam.only`, see `src/objectComponents/spotBeam.js`,
`beamCastsLight`). Shadows are off by default. The budget lives in the rig file.

**On a server older than `beam.only`** (the installed 0.4.16 on aylmo drops the
field) `rig.mjs --beams auto` finds out with a probe lamp and **bakes** the
beam-only lamps into one mesh (`beams-glb.mjs`: all cones, one draw call, the
lamp's colour and the fade in vertex colours, unlit). That is a named
workaround: baked beams cannot be re-aimed in the Studio. Once the install
carries `beam.only`, run `rig.mjs` again and the lamps become editable entities.

Measured 2026-09-27/28 with `rig-look.mjs --gpu` (headed Chromium, ANGLE on
Vulkan, the **RTX 3080 Laptop GPU** — the renderer string is checked and the
run stops if it is software), 960×600 at DPR 1, door view, 8 s:

| the room holds | fps | frame median / p95 | draw calls | triangles |
| --- | --- | --- | --- | --- |
| 90 real lights, 90 entity beams, no shadows (what the owner found "laggy") | 1.0 | 1004 / 1004 ms | 283 | 126k |
| 8 real + 82 `beam.only` entities, no shadows (this branch) | 239.6 (one hot run: 53) | 4.2 / 4.2 ms | 283 | 126k |
| 8 real + 82 `beam.only` entities, shadows on | 239.7 | 4.2 / 4.3 ms | 374 | 212k |
| 8 real + 82 beams baked, no shadows (the local tier tonight) | 239.7 | 4.2 / 4.3 ms | 51 | 53k |

240 fps is the display's refresh: vsync-capped, so "at least". The same
"8 real, baked" room in a phone-shaped viewport (390×844, DPR 3) on the same GPU
also held 239.6 — that is the laptop's GPU, **not a phone**; no phone was
measured.

Earlier, headless on SwiftShader (software): hall alone 7.6 fps, 90 real lights
0.1, and 90 real lights + shadows **went black** — every lit material failed
to compile ("texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(32)").
Hence `SHADOW_SAFE_REAL_LIGHTS = 12` in `rig-lib.mjs`, and a read-back after
every write that switches shadows off past it. **Do not run the hall on
SwiftShader again**: those runs drove aylmo's CPU to 100 °C. `rig-look.mjs`
now refuses without `--gpu`, opens one browser per view and waits for the CPU
package to be under 88 °C before each.

## Things that have already gone wrong

- **A rented GPU left running bills until somebody notices.** Any failure
  inside the job releases it, and so does Ctrl-C. If a run is interrupted some
  other way: `colab stop -s place-<name>`, and `colab sessions` lists what is
  up.
- **The frames go up in 16 MB pieces.** `colab upload` carries the file
  base64'd inside one JSON body; a hall's worth of photographs answers 500 and
  keeps nothing.
- **`--gpu local` runs the same Meshroom here.** The 2025.1.0 Linux build
  lives unpacked at `~/tools/meshroom/current` (or wherever `PLACE_MESHROOM`
  points); it carries its own CUDA libraries and needs only the NVIDIA driver.
  Nothing is uploaded and nothing is rented — the offline route for a venue
  with power and no internet. On aylmo's 8 GB card the depth-map step is the
  tight one, so the frames are shrunk to `--max-width` exactly as for Colab;
  a hall at that size took the L4 25 minutes, expect longer here. The log is
  `<work>/meshroom.log`, the project `<work>/project.mg` (opens in the
  Meshroom GUI, `~/tools/meshroom/current/Meshroom`). Measured 2026-09-22: the 67
  Moxir frames at 2400 px took **10 min on the RTX 3080** (the L4 took 25) with
  `llama-server` holding 5.7 GB of the card's 8 GB the whole time. Trap: this
  release ignores `--cache` when `--save` is given and writes its node cache to
  `/tmp/MeshroomCache` (≈ 400 MB per hall) — the result finder looks there too,
  and `/tmp` is where to clean up.
- **Meshroom is a 13 GB download** onto the box before any GPU work — it
  carries CUDA. A single-stream `wget` managed about 3 MB/s and was still
  going after an hour, long enough for Colab to reclaim the runtime
  mid-download (that is what ended the first real run). `aria2c -x16` does
  the same 13 GB at ~48 MB/s: about five minutes. The job runs detached and
  touches a heartbeat every 15 seconds, so the quiet stretch is never
  mistaken for death.
- **Colab's kernel websocket wedges.** A poll was seen hanging for twelve
  minutes while the reconstruction carried on beside it. Polls give up after
  four minutes and ask again; the job never notices.
- **A phone's HEVC clip is limited-range yuv420p** and ffmpeg 9's JPEG encoder
  refuses it, which silently loses the whole video. The extraction names
  `-pix_fmt yuvj420p`, and falls back to PNG.
- **Headless Chrome gets SwiftShader, never the NVIDIA card.** The preview
  renders are software-rendered on purpose, and they are slow — a 300k
  triangle room can take a minute to paint.
- **The local tier is the owner's live install.** Import into a NEW space;
  never point this at one that already holds work.
- **A space scanned from a phone already HAS its footage.** `--from-space`
  passes `--no-sources` to the importer for exactly this reason; passing
  `--sources` as well would hang a second copy of every picture on the same
  wall. `scripts/place/place.test.js` is the guard.
- **serverXR's image carries only `src`, `public` and `shared`.** The build
  route spawns `scripts/place/place.mjs`, so on a build that did not ship
  `scripts/` it answers 501 and says so rather than failing inside a spawn a
  second later. It is a local-only route, so this is a trap rather than a
  live defect — the same one `scripts/space-bundle.mjs` already paid for.

## Unverified

The Meshroom invocation in `reconstruct.py` is written from the 2025.1.0
documentation. The rest of the Colab step — sign-in, session, chunked upload,
detached start, polling, download, stop — has been run against a real box.
