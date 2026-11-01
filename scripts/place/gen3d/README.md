# gen3d: object crop to sized GLB (place-twin object step)

One command: `scripts/place/gen3d/gen3d.sh <image|dir> [options]`. It stages the crops, picks a model, runs that model's runner on OUR Colab Pro+ session (gevorg login, `colab-pinned.sh`, CLI 0.7.5), downloads, optionally scales to the measured size, and writes provenance per output. The session is closed by the runner (trap); gen3d prints `sessions` after the run so you can see none of yours remain.

```
gen3d.sh crops/ --no-people-confirmed --out twin/objects --sizes sizes.json
gen3d.sh chair.png --no-people-confirmed --height 0.95          # auto -> TripoSG for furniture
gen3d.sh reel.png --model trellis-image-large --allow-conditional --no-people-confirmed
gen3d.sh crops/ --model hunyuan3d-2.1 --use research --no-people-confirmed   # marked comparison only
gen3d.sh --list      # registry table
gen3d.sh crops/ --dry-run   # show the plan, touch nothing
```

Options: `--model <id>|auto` (default auto) · `--out dir` (default `<input dir>/gen3d-out`) · `--where colab|local` · `--kind furniture|thin|round|default` (default guessed from the file name) · `--gpu` · `--height M` or `--size W,H,D` (metres) or `--sizes file.json` (`{"chair": {"height_m": 0.95}, "reel": {"size": [0.4,0.1,0.4]}}`, per file name, wins over the global) · `--use product|research` · `--allow-conditional` · `--no-people-confirmed` · `--dry-run`.

## Rules the tool enforces
1. **Input crops contain no people.** You look; then pass `--no-people-confirmed` (recorded in provenance). Without it the run is refused.
2. **research_only guard.** A model with `research_only: true` (Hunyuan3D-2.1: Tencent licence excludes EU/UK/South Korea, 5.c bars display outside the Territory) is refused for product. With `--use research` the output goes to `<out>-RESEARCH-ONLY/` with a `RESEARCH-ONLY.txt`, and provenance says so. Auto never picks it.
3. **Conditional licences need your word.** TRELLIS image-large (nvdiffrast / Inria rasterizer terms), TRELLIS.2, Step1X-3D need `--allow-conditional`, recorded in provenance. Auto skips them for product unless that flag is given.
4. **Pinned code.** Every model in `models.json` has a full 40-char code commit; the registry test fails otherwise. Weights revisions are NOT pinned yet (`weights_rev: null`, owed).
5. **Local is refused** until a local runner is proven: `where: ["colab"]` for all today. RTX 3080 8 GB: TripoSG is borderline, untested.

## Auto ranking (from `gen3d-kit/JUDGE.md`, n=1 pilot on dark crops, a pilot not a benchmark)
furniture: TripoSG, then TRELLIS · thin (tripod, camera on stand): TRELLIS, then TripoSG · round (reels): TRELLIS, then TripoSG. First model that passes the guard wins. For product use today that means TripoSG nearly always (TRELLIS is conditional).

## Scale step
`scale.mjs` reads the GLB, takes the world box from the POSITION accessor bounds through the node transforms, applies ONE uniform scale (by `--height`, or the smallest ratio fitting the measured box), seats the object on the floor (min Y = 0, centred X/Z) by wrapping the scene in a new root node. The unscaled file is kept as `<name>.raw.glb`. Provenance records scale, before/after extent and the per-axis residual versus the box. Checked on a real TripoSG chair GLB: 1.8765 m raw to 0.95 m; Blender import reads 0.950 m tall, min Z 0. It fixes size, not shape: unseen sides are invented by every model.

## Per output
`<name>.glb`, `<name>.raw.glb` (if scaled), `<name>.provenance.json` (input path and sha256, model, repo, code rev, licences, territory, use, runner file sha256, GPU, seconds, scale, no-people flag, caveats), plus `gen3d-run.json` and `raw/` (runner outputs and turntables).

## Files
`gen3d.sh` wrapper · `gen3d.mjs` CLI · `registry.mjs` registry, guard, auto · `scale.mjs` · `models.json` data · `runners/` one script per model · `gen3d.test.js` (24 tests: `npx vitest run scripts/place/gen3d`).

## Add a model
Add an entry to `models.json` (licence read from the primary source, pinned commit, runner), a runner in `runners/` that takes its paths from args or env, run the tests. The registry test refuses an unpinned commit, a missing runner, or a research-only model marked commercial.

## Owed
Texture on our dark crops is unsolved (JUDGE.md); SAM-mask cut-out step before generation (TripoSG needs cut-out inputs since RMBG-1.4 is non-commercial); pin weights revisions; one clean cold run of every runner through gen3d (gen3d itself has been tested with a dry run and unit tests, NOT through a live Colab session); TRELLIS.2 needs an HF token (owner); local RTX 3080 runner.
