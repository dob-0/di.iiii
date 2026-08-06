---
name: dii-space-weight-audit
description: 'Audit and reduce what a di.iiii space actually costs a visitor, and find what is quietly broken inside it. Use when a space or published project feels heavy, before an exhibition or opening, when asset storage grows, when a scene loads slowly, or when asked to optimize spaces.'
argument-hint: 'Name the space, or say "all spaces"'
---

# dii Space Weight Audit

## When to Use
- A space, published project or code page feels slow, or you are asked to optimize one.
- Before an opening, an exhibition, or anything that puts real visitors on a mobile network.
- Asset storage is growing and nobody knows what is still referenced.
- A scene renders blank, an image is missing, or the Assets panel shows something that 404s.
- You need honest per-visit numbers rather than "the registry says N MB".

## Outcome
Fewer bytes per visit, nothing on screen changed without someone looking at it, and every
finding stated with the measurement that produced it.

## The One Rule That Matters

**Audit the page, not the database.**

`azd` has an empty asset registry and a 67KB document. It shipped **63.9MB per visit** —
eight uncompressed GLBs fetched from a contributor's personal `raw.githubusercontent.com`
repo. No registry query could ever have shown that, and a registry-only audit reported the
space as clean. Always run the browser pass.

The inverse trap is just as real: registry `size` is what the *uploader* claimed. The server
re-encodes images on upload to scrub EXIF, which changes the content hash and leaves the
recorded size stale — a 4.0MB JPEG lands as 2.2MB, a 10.7MB PNG lands as **13.3MB**. Measure
stored bytes with a ranged GET. Never quote a registry size as fact.

## Procedure

1. **Snapshot first.** `node scripts/di-sync.mjs pull --commit` in `di-spaces`. That commit is
   the only rollback. Confirm it says *verified unchanged* — if prod drifted from the snapshot,
   stop and find out why before touching anything.
2. **Audit.** `node scripts/audit/audit-spaces.mjs --env prod --deep`. Structural pass plus the
   browser pass. Read the per-surface byte totals before the per-asset ones.
3. **Mirror to staging.** `bash scripts/push-all.sh staging`, then re-audit staging and confirm
   it matches prod. Optimize there. Never first on prod.
4. **Optimize.** `node scripts/audit/optimize-assets.mjs --env staging --apply`. Works from live
   bytes; recompresses in place; rewrites every reference and the registry entry.
5. **Verify references.** Every id a live scene or document points at must resolve. A swap that
   half-applied is worse than no swap.
6. **Look at it.** Render each changed surface on both tiers and compare. Not "it loads" —
   *look*. See Looking, below.
7. **Promote,** then re-snapshot so the backup describes the optimized truth.

## Transforms And Their Risk

| what | do | why |
|---|---|---|
| `.glb` | Draco. Always. | Lossless geometry, no decimation. Routinely 10–20×: `nush.glb` 14.09→0.64MB, `krug.optimized.glb` 12.01→2.04MB. `.optimized.glb` does **not** mean compressed — the existing pipeline only quantizes and webp-encodes textures. |
| images | webp q90 **at original pixel dimensions** | A downscale is a bet on what the artwork is. See Never Resize. |
| video | h264 crf23, faststart, ≤1920 | Only keep a real win. A file already at ~1.2Mbps for 1080p gets *bigger* when re-encoded; the tool discards those. |
| base64 in a scene | upload as a real asset, reference by `assetRef` | `platform-recordar`'s scene inlined 5 GLBs: 3.5MB raw, 2.16MB gzipped, `no-store`, re-fetched every open. After: 7.8KB. |
| third-party fetches | move onto di.iiii as assets | Same origin, immutable cache, and the piece stops depending on someone else's repo staying public. |

Meshopt is not a substitute for Draco here — measured on the same eight meshes it produced
12.5MB against Draco's 3.1MB.

## Never Resize

`wcc/sanjay-j-choudari` is dense typewriter pages the camera sits nose-close to. Capping it at
2048px cut 10.7MB to 0.25MB and visibly destroyed the letterforms. At full resolution, webp q90
gives 13.26MB → 1.60MB and is indistinguishable at 3× magnification.

You usually cannot tell from a filename whether an image is a backdrop or the work itself, and
most scenes do not show their content from the default camera — so you cannot check. Convert the
codec, keep the pixels.

## Looking

- Headless Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader` renders these
  scenes correctly. `deviceScaleFactor: 2` — DPR 1 hides canvas and layout bugs.
- **Never wait on `networkidle`.** Looping video means it never fires. Wait for
  `domcontentloaded` plus a fixed settle.
- Diff with `magick compare -metric RMSE`. Draco should land near zero (`alla-virabyan`: 0.0002).
  A large RMSE is not automatically a regression — physics scenes and looping video differ frame
  to frame — so crop the same region from both and look.
- A page that renders *empty* is the failure mode to fear. It throws nothing, returns 200 for
  every request, and only a screenshot catches it.

## Known Traps

- **Code projects are `<iframe srcDoc>`, so their origin is `null`.** Every fetch they make is
  cross-origin. The serverXR asset routes send CORS headers; nginx's static `/draco/` does not,
  so a code page cannot use the bundled Draco decoder — models silently fail to decode and the
  page renders empty. Until `nginx.conf` serves `/draco/` with `Access-Control-Allow-Origin`,
  point `setDecoderPath` at the version-matched jsdelivr copy.
- **`DELETE /api/projects/:id/assets/:assetId` leaves the entry in the document.** The binary
  goes, the registry entry stays, and the Assets panel shows an item that 404s. Prune the
  document after deleting. Space-level registries are disk-derived and self-heal.
- **Two upload response shapes.** The project route nests under `asset`; the space route returns
  `assetId`/`size` flat. Reading only the nested one silently drops every space-level result.
- **`HEAD` is not implemented on asset routes** — a HEAD probe reports every asset missing. Use
  `Range: bytes=0-0` and read `content-range`, falling back to `content-length` for routes that
  ignore Range.
- **Uploads are capped** at 60 per 10 minutes per address; `request()` honours `Retry-After`.
  A large image (6MB, 10400px) has been seen to 502 the EXIF-scrub path four retries deep.
- **Space and project asset stores are separate.** The same media legitimately exists twice when
  a space scene and its published project both use it. That is scoping, not duplication.
- **Unreferenced is not unwanted.** Orphan sweeps empty items out of artists' Assets panels.
  sha256-id assets restore to the identical id from the snapshot, so it is reversible — but it
  is someone else's workspace, and it is their call.

## Repo Anchors
- Audit + optimize tools: `~/di-spaces/scripts/audit/`
- Snapshot, mirror, drift: `~/di-spaces/scripts/di-sync.mjs`, `push-space.mjs`, `push-all.sh`
- Env resolution and the `LIVE_*` = staging trap: `~/di-spaces/scripts/lib/dii.mjs`
- Compression on the wire: `../../nginx.conf`
- Asset routes: `../../serverXR/src/routes/projectRoutes.js`, `spaceRoutes.js`
- Code-page rendering: `../../src/project/components/PublicProjectViewer.jsx`
- Loader extension support: `../../src/objectComponents/ModelObject.jsx`

## Validation
- `node scripts/audit/audit-spaces.mjs --env <tier>` exits non-zero while findings remain.
- Every referenced asset resolves, on both tiers.
- Each changed surface rendered and compared against the other tier.

## Completion Checks
- Per-visit bytes measured in a browser, before and after, for every surface touched.
- No broken references, no dangling registry entries, no base64 inlined into a scene.
- Nothing resized; every visual change looked at by a person.
- Snapshot committed before the change and again after.
- Findings reported with the number that produced them, and anything unverified named as such.
