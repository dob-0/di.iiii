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
