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
# 0 — back the space up first (a bundle + the hall's document, with checksums)
B=~/di-backups/moxir-before-<what>-<date>; mkdir -p $B
node scripts/space-bundle.mjs export moxir --data-root ~/.local/share/di.iiii/data --out $B/moxir.space-bundle.tar.gz

# 0b — what the photographs say (EXIF, GPS, sun): see "What the photographs' own metadata says"
python3 scripts/place/photo_meta.py --photos /mnt/data/footage/moxir-2026-10-17 \
    --site scripts/place/rigs/moxir-site-2026-09-28.json --out /mnt/data/footage/place-moxir-hall-v3/photo-meta.json

# 1 — the hall: a parametric Soviet multi-span crane hall, flat space-frame roof (Blender, headless)
blender -b -P scripts/place/hall.py -- --out /mnt/data/footage/place-moxir-hall-v3 \
    --dims scripts/place/rigs/moxir-hall-dims-2026-09-28.json \
    --dims scripts/place/rigs/moxir-hall-features-2026-09-28.json \
    --preview-camera=-1.7,6.88,50.2,1.65,-10,66     # optional: a Workbench render from photo 032's camera
cp /mnt/data/footage/place-moxir-hall-v3/hall.json scripts/place/rigs/moxir-hall-2026-09-28.hall.json  # the tests' fixture

# 2 — it becomes the room of the space (the footage wall is left alone)
node scripts/place/import.mjs --work /mnt/data/footage/place-moxir-hall-v3 \
    --name moxir --no-sources --replace --title "MOXIR — the hall"

# 3 — the rig, from a rig file, against the hall's grid and the owner's zones
node scripts/place/rig.mjs --rig scripts/place/rigs/moxir-2026-10-17.json \
    --hall /mnt/data/footage/place-moxir-hall-v3/hall.json --project moxir-hall

# 4 — look at it on the GPU (one browser per view, waits for the CPU < 85 °C), count frames
node scripts/place/rig-look.mjs --gpu --base https://local.thedi.studio \
    --hall /mnt/data/footage/place-moxir-hall-v3/hall.json \
    --rig scripts/place/rigs/moxir-2026-10-17.json --out ~/Downloads/moxir-hall --tag dj \
    --views crane,ground,floor,booth   # also dance, stage, roof, backdrop, door, mid, over, close

# 5 — the photo-matched shot beside and over the photograph
python3 scripts/place/compose.py --photo /mnt/data/footage/moxir-2026-10-17/032-file_76.jpg \
    --render ~/Downloads/moxir-hall/dj-crane.png --out ~/Downloads/moxir-hall/dj-crane-vs-photo032.png
```

Take the rig down again: `node scripts/place/rig.mjs --project moxir-hall --remove`.
Every rig entity's id starts `rig-`; a re-run deletes those first and touches
nothing else except the night (ambient, fog, background) and the shadow switch.
Undo the whole hall: import the backup bundle (`space-bundle.mjs import … --force`).

**`hall.py` (v2, 2026-09-28)** builds, in real metres, one mesh per material
(14 meshes, ~60k triangles for MOXIR, 46k of them the roof): several 24 m spans
under ONE flat roof, the nave centred on x = 0 and open to its neighbours;
precast columns with a solid shaft and a Y head flaring symmetrically across
the hall (45° chamfers) carrying a grey steel plate girder on each side
(stiffeners and a handrail on the nave side) and a centred upper column;
paired columns at the expansion joint; a double-layer space frame
(square-on-square offset grid, 3 m module, bottom chord 11.0 m, top 13.5 m;
full over the nave and its neighbours, bottom chords only further out; members
are open triangular prisms, 6 triangles each, double-sided); the deck with
openings under raised flat-top box lanterns (glazed sides and ends); outer walls
with three window bands only at the building edge; end walls with the gates;
low block walls, X bracing, yellow cranes; the machines named in the features
file as massing boxes; the owner's zones as floor tape. v1's pitched Warren
trusses, ridge lantern, clerestory and aisles were wrong against the
photographs (the owner's "arcs") and are gone — git history keeps them
(`e3b843fa`). `hall.json` records every value's source, range and confidence
and the geometry the rig hangs against (grid, heights, lanterns, walls,
massing, zones, cameras); `place.json` only says `measured` for a taped value.

The MOXIR numbers: `rigs/moxir-hall-dims-2026-09-28.json` (the architecture
correction of 2026-09-28: photographs, the Esri Wayback 2020-10-30 Maxar image
for the four spans, the lanterns and the expansion joint, VGGT and perspective
for heights) and `rigs/moxir-hall-features-2026-09-28.json` (gates, cranes,
low walls, the press, **the owner's zones**, the photo-032 camera). Crane rail
7.6 m is still disputed (6.6–8.4). Nobody has taped the hall.

### The zones the owner marked (2026-09-28)

He drew them on three photographs: "red backstage, green stage, blue dance
floor". Photo 032 (his 0387927a) was taken from the crane parked at the NW
end, so its camera was fitted from the photo itself: a level-camera
perspective fit of the nine visible columns of one row at the 6 m pitch
(rms 3.0 px; horizon from the runway girders; camera 6.88 m up — VGGT said
7.33 — 1.7 m left of the nave axis, 3.8 m from the entry grid line). Every
marked pixel then lands on the floor at D = f·h / (v − v_horizon). Hall frame
(x across, + = SW; z along, + = the entry; s = 54 − z metres from the entry):

| zone | marked (x, z m) | used by the model and the rig | how sure |
| --- | --- | --- | --- |
| dance floor (blue) | x −8.7..2.0, z 27.7..39.7 (the part in the photo) | x −10..10, z 27.5..48 (runs on under the crane, his words) | ±8 % of the distance, ±1.5 m hand |
| stage (green) | x −12.0..2.7, z 6.2..23.5 — front at the white bags, back along the press | x −8..8, same z; deck 16 × 12 m on the front edge, facing the entry | same |
| backstage (red) | near edge z −1.4..−0.1, x −12.5..1.2 | x −11..1, z −10..−1 (depth a GUESS) | near edge only |
| the press (backdrop) | photo 032 u 647–680, base v 343 → x 0.25..3.05, front z 3.2, 4.5 m + crown | massing boxes, with the machine line beside it | ±20 % |

Superseded the same day for the stage and the dance floor: see "The DJ place" below
(the stage is a 3 × 2 m DJ riser at the press; the dance floor runs up to it).

Cross-check: the ground photos taken beside the press sit 39–46 m from the
crane camera in the VGGT cloud; the fit puts the press 47 m out. The press
stands at grid line 9, beside the expansion joint (photo 021, paired columns,
was taken there).

### What the photographs' own metadata says (`photo_meta.py`, 2026-09-28)

Before placing anything against the photographs, read what they carry:

```bash
python3 scripts/place/photo_meta.py --photos /mnt/data/footage/moxir-2026-10-17 \
    --site scripts/place/rigs/moxir-site-2026-09-28.json --out <work>/photo-meta.json \
    --poses <vggt>/poses_scaled.json --sat <sat_wb37890_z18_stitch.png> --sat-out <plot.png>
```

Per photo: capture time with its UTC offset, device, lens, 35 mm-equivalent
focal → **pinhole intrinsics** (fx = f35 / 43.27 mm × the native frame's
diagonal in pixels — the Exif/CIPA DC-008 diagonal definition; a phone's 1:1 or
16:9 crop keeps its native equivalent focal); the **GPS** fix → local tangent
plane (WGS-84 radii) → building frame → hall frame (the site file); the **sun**
at that moment by the NOAA solar position algorithm (GML solar-calculator
equations, after Meeus), cross-checked against an independent algorithm
(Michalsky 1988) — they agree within 0.01° azimuth and 0.09° elevation for
every photo — and where sunlight through an opening H m up lands on the floor
(`floor_shift_per_m_drop_hall_xz`). With `--poses` it registers the VGGT
cameras to the GPS by a 2-D similarity transform (Umeyama 1991) with
leave-one-out spread. No third-party packages (Pillow, numpy); `pvlib` would be
the standard library for the sun but its 18.5 MB wheel would not download here
three times running, so the NOAA equations are written out and cross-checked.

MOXIR (37 photos):

| what | found |
| --- | --- |
| iPhone 14 Pro Max, 000–015, 2026-08-24 16:39–17:03 (+04:00) | GPS on all 16; 24 mm-eq (fx 2688 px on 4032) and 77 mm-eq (fx 8624 px); no compass heading, no horizontal-error tag |
| Galaxy S24, 017–025, 036–038, 2026-09-17 18:03–18:05 | no GPS; 13 mm-eq ultra-wide, 1:1 crop → fx 1498 px on 2992 (EXIF f 2.2 mm / 1.4 µm pixels gives 1571; 5 % apart) |
| 027–035 (1280 × 720) | EXIF stripped — Telegram "photo" compression. Photo 032's fitted f (555 px) is 15 % longer than an S24 ultra-wide 16:9 frame would have (481 px); unproven which camera took it |
| videos 016 (.MOV, 1280 × 720, re-encoded 2026-09-01) and 026 (S24, 2026-09-17 14:03Z) | no location atom, no ©xyz |
| GPS spread (15 fixes; 013 dropped: quantised to 4 decimals, 220 m off) | hall x −9.8…30.7, z 0.1…74.2: the crane shots land 13–25 m NW of where the crane stands, some outside the building; altitude 1662.8–1667.1 m and INVERTED (crane shots lowest) — useless indoors under a steel roof |
| VGGT ↔ GPS registration | scale 0.92 of the assumed 30.8 m/unit, axis bearing 154.5° (leave-one-out 148.5–163.1°) vs the satellite's 144°, rms 15.9 m: consistent with the satellite within the GPS's indoor error, and no better than it |
| **sun check (photo 004, 17:00:23, az 257.9°, el 30.5°)** | light falls toward hall −x (NE): 1.55 m across and 0.69 m toward the far end per metre of drop. Through the SW-span lantern's SW glazing (x 30, sill 13.55–14.05 m) the lit band's SW edge lands at x 8.2–8.9; measured on the floor in 004 (EXIF f, horizon from the runway girders, the centred far gate): x 7.8–8.3. Flipped (+x = NE) it would lie at x ≈ −8. **Orientation confirmed; axis 144° good to about ±6°** (0.16 m of edge per degree, ±1 m measured) |

Where the originals of 027–035 may be: only on the phone that took them (the
sender's gallery, or its Telegram "sent" cache as a FILE). Telegram recompresses
anything sent as a photo and strips EXIF on its servers, so di.bo's
`fetch-large.py` would bring back the same stripped copy. The Drive `_inbox/received`
folder is empty; no MOXIR file exists on the connected Drive. Ask the sender to
send them again as files (📎 → File), or drop them in Drive.

### The DJ place (the owner, 2026-09-28)

His words on the first rebuild: "i mention the dj place i think it will not big
how you created you made it so big, so stage is the near the metal thing like dj
near a bit top and centre of the metal things". So the green is a **DJ place**,
not a 16 × 12 m stage: a small riser, a bit raised, centred on the forging
press, close in front of it, the machinery the picture behind the DJ.

`stage.kind: "booth"` (rig-lib.mjs `stageFrame`): a riser `width × depth × deck`
centred on `centre_on` (massing ids) `gap_m` in front of whatever of the
backdrop stands behind it. MOXIR, all ESTIMATED (rig file `stage.estimated`):

| | value | range | how |
| --- | --- | --- | --- |
| riser | 3 × 2 m (three 2 × 1 m decks), 1.2 m high | 1.0–1.4 m ("a bit top") | standard stage decks; options A–D in `stage.options` |
| centre | x 1.65 m (the press's centre) | 0.5–3.5 | photo 032 fit; photo 004 via the white bags gives 1.7 |
| back edge / front | z 4.2 / 6.2 m (1.0 m from the press face at z 3.2) | press face 2.0–4.5 | 032: D 47 m from the crane; 004: D 43 m |
| DJ table | 1.8 × 0.8 m, 0.95 m high, 0.2 m from the front | | |
| treads | left side, 6 × 0.2 m rise | | toward the backstage |
| barrier | 9 m, 1.3 m pit, 1.1 m | | drawn see-through |
| goalpost | towers 7 m apart straddling the riser, header 7 m up over its back half | | above the press crown (5.3 m) so it frames the machinery; no truss is rented — OWED |

Why the owner's marks sit ~3.4 m left of the axis: the SW half of the nave, from
the press to the white bags, is machinery (photo 004 with its EXIF intrinsics: a
hopper at x ≈ 5.7, z ≈ 21.6, the rusty drum and pipes at x 3–8 near the press).
He marked the open floor. So the dance floor (`zones.dance`) is the open NE side
from the barrier (z 7.5) to the bags (x −10…3.5) and full width from the bags to
under the crane (z 22–48; the bags must be cleared). Backstage (red, from
1c3956d1 = photo 024): left of the press from its front line back 12 m (depth a
GUESS). `hall.py` draws a zone's `extra` rectangles as the same floor tape.

**The rig at the booth**, every rental count kept: 4 UP-B380F on the floor right
behind the riser + 2 each side of it, 10 on the dance floor's column bases;
6 UP-250BSW under the header + 6 as side light from the first three column pairs
(`booth-key`, aimed at the DJ); 8 bee-eyes on side arms up the towers
(`tower-ladder`); the 50 PARs as before, the press's six uplighting it from its
foot; 2 lasers on the tower tops (7.15 m); CO2 and sparks in the pit. Lamps on
the booth mirror about the booth's axis, lamps on columns about the nave's
(`groupAxis`); the tests check each group about its own axis. **No narrow beam
through the DJ**: `performerBox` (the riser's back strip to the table, 2 m tall)
is checked on every aim of every beam ≤ 6° (B380, bee-eyes, lasers) — seen to
fail on an all-to-centre aim that leaned the beams behind the DJ 15°, and those
beams now meet 13 m straight over the booth. The 8 real lamps: 4 header spots,
2 booms, 2 column PARs; the press's uplights are baked (0.35 m from its face a
real lamp blows the face out white).

Seen on the RTX 3080 (ANGLE Vulkan, headed, one browser per view, CPU < 85 °C),
60 fps at the 60 Hz cap on every view (median 16.7 ms, p95 ≤ 16.8 ms), 86–99
draw calls, 194k triangles: `~/Downloads/moxir-hall/dj-crane-vs-photo032-marks.png`
(photo 032 with his marks | model | 50/50), `dj-ground-vs-photo024-marks.png`
(his 1c3956d1; camera APPROXIMATE — a 5-point fixed-height fit left rms ~90 px,
though the far gate and the press fall within 1–2° of the photo's bearings),
`dj-floor.png` (the crowd's view: the DJ, the towers, the press behind),
`dj-booth.png` (the DJ's view out), `dj-gps-on-satellite.png`.

### The column wash — a baked lightmap (fixes "the room reads dark")

Two causes, both measured. (1) Every real lamp's `light.distance` — which is
both the drawn cone's length and three.js's light cutoff — was set to the throw
to the surface it is aimed at, and three.js's cutoff factor
(1 − (d/cutoff)⁴)² is ZERO at the cutoff: the real lamps put no light where
they were aimed. Real lamps now get twice the throw (88 % of the light at the
surface; the cone runs on behind the surface that hides it) — a named
workaround; a separate beam length in the platform is owed. (2) Only 8 lamps
are real, so the 42 column PARs lit nothing. `wash-glb.mjs` bakes the light of
every beam-only PAR onto the surface it lands on (a column face, the press):
E = I · spot(θ) · cos(incidence) · falloff(d), L = albedo/π · E — the same
spot, penumbra, inverse-square and cutoff terms three.js uses for a real
SpotLight — sampled on a grid, written as vertex colours on an unlit,
alpha-blended decal 2 cm off the surface (alpha = L × the colour's brightest
channel, so over a dark surface it reads as added light). One draw call for
all of them. Direct light only, no shadows or bounce, like the real lamps with
shadows off. Seen: the baked pools on the press read like the real lamps'
pools beside them (`~/Downloads/moxir-hall/arch-v3-backdrop.png`). The night
was also raised by eye (ambient 0.35 → 0.8, fog 30/150 → 60/250 m: in a 108 m
hall the old fog blacked out everything past 30 m).

**`rig.mjs` / `rig-lib.mjs`** place each group by a named rule against the grid
(`stage-back`, `truss-header`, `column-uplight` with a `columns` spec of zones,
rows and faces, `backdrop-floor`, `crane-bridge`, …); the stage stands in a
zone of hall.json (`stage.zone`, with `stage.backdrop` naming the massing
behind it). They aim it
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

| 8 real + 82 beams baked + **104 fixture bodies (one instanced GLB)**, no shadows (2026-09-28, the display at 60 Hz) | 60.0 (all 17 views 56–60) | 16.7 / 16.8 ms | 59–83 | 108–119k |
| **v2 hall** (flat space frame, 4 spans, 60k tris) + 8 real + 82 baked beams + 46 baked washes + 104 bodies, no shadows (2026-09-28, 60 Hz; crane view at 1280×720, others 960×600) | 53–60 (5 views; p95 16.8–33.4 ms while the CPU sat at 83–93 °C) | 16.7 / 16.8–33.4 ms | 71–91 | 173–182k |

240 fps is the display's refresh: vsync-capped, so "at least". On 2026-09-28
the display ran at 60 Hz, so the fixture run is capped at 60: p95 16.8 ms
means no frame was dropped, not how much headroom there is. The same
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
