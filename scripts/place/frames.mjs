#!/usr/bin/env node
/**
 * frames.mjs — step 1 of the place pipeline.
 *
 * A folder of photos and videos of a hall goes in. A folder of frames a
 * reconstruction can actually use comes out.
 *
 *   photos  → copied as they are
 *   videos  → ffmpeg pulls frames at 2 fps
 *   then    → the blurry ones and the same-picture-twice ones are thrown out
 *
 * Usage:
 *   node scripts/place/frames.mjs --from <folder> --work <folder> [options]
 *
 *   --from <dir>        the drop folder (photos and/or videos, nested is fine)
 *   --from-space <name> pull the footage a phone collected into that space's
 *                       `sources` room over the API, instead of a local folder
 *   --api <base>        which di.iiii to pull from (default the local one)
 *   --work <dir>        where the pipeline keeps its working files
 *   --fps <n>           frames per second pulled from each video (default 2)
 *   --min-frames <n>    how many usable frames a room needs (default 60)
 *   --blur-floor <n>    fixed sharpness floor; default is read off the batch
 *   --keep-extracted    leave the raw ffmpeg output on disk (debugging)
 *
 * 360 footage (Insta360 and other 2:1 equirectangular exports) is recognised by
 * what is inside the file, cut into ordinary pinhole views, and mixed with the
 * phone footage in the same images/ folder (see pano-lib.mjs, split360.py):
 *   --pano-fps <n>      frames per second pulled from each 360 clip (default 1)
 *   --max-pano-frames <n>  at most this many spheres are cut (default 150)
 *   --views <n>         pinhole views round the horizon per sphere (default 8)
 *   --pano-fov <deg>    field of view of each view (default 90)
 *   --no-up             do not cut the view straight up (default: one up)
 *   --view-size <px>    side of each view (default: the sphere's own density)
 *   --mask-below <deg>  paint black what points this far under the horizon (default 60)
 *   --mask-sector <yaw:half>  paint a sector of yaw black (a person behind the camera)
 *   --dry-run           say what would happen, touch nothing
 *
 * Writes <work>/images/  and  <work>/frames.json
 */
import fs from 'node:fs'
import path from 'node:path'

import {
    PLACE_DIR, parseArgs, num, say, warn, die, ensureDir, writeJson,
    IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, walkFiles, findPython, runPythonJson, run
} from './common.mjs'
import { selectFrames, framesVerdict, MIN_USABLE_FRAMES } from './frames-lib.mjs'
import {
    viewPlan, viewSize, classifyMedia, hasInstaTrailer, readGPano, probeVideo, thinEvenly, parseSector,
    INSTA_EXPORT_HELP, DEFAULT_MASK_BELOW
} from './pano-lib.mjs'
import { DEFAULT_API, extensionFor, makeClient, readToken, sourcesProjectId } from './api.mjs'

// PULLING A WALK BACK DOWN — the other direction of the same seam.
//
// A phone collects a hall into the space's own `sources` room, live, on whatever
// tier that space lives on (src/scan/ScanSurface.jsx). The reconstruction runs on
// the studio machine, which may not be the machine the space is on at all: the
// owner walks a factory in Yerevan against dev.diiii.xyz and builds the copy at
// home. So the footage travels, over the same API the importer already speaks.
//
// It is a plain sequential download on purpose. A hall's walk is a few hundred
// megabytes across fifty or sixty files; parallel requests against one server
// win nothing on a domestic uplink and turn a readable progress line into noise.
// Nothing is retried either — a file that does not come down is NAMED and the
// count goes on, because sixty of sixty-one frames still builds a room and a
// pipeline that stops on one missing picture wastes the walk.
export const pullFromSpace = async ({ space, api, work, token, limit }) => {
    const client = makeClient(api, token)
    const project = sourcesProjectId(space)
    const document = await client.get(`/api/projects/${project}/document`)
    if (document.status === 404) {
        die(
            `No footage room on ${api} for a space called "${space}".`,
            'Walk it first at /' + space + '/scan, or name a local folder with --from.'
        )
    }
    if (!document.ok) {
        die(`${api} would not hand over ${project} — HTTP ${document.status}`, document.text.slice(0, 200))
    }
    const assets = Array.isArray(document.body?.document?.assets) ? document.body.document.assets : []
    const wanted = assets.filter((asset) => extensionFor(asset)).slice(0, limit)
    if (!wanted.length) {
        die(`${project} holds nothing this pipeline can read — no photographs and no clips.`)
    }
    const into = path.join(work, 'pulled')
    fs.rmSync(into, { recursive: true, force: true })
    ensureDir(into)
    say(`  pulling ${wanted.length} files out of ${project} on ${api} …`)
    const missing = []
    let carried = 0
    for (const asset of wanted) {
        const result = await client.bytes(`/api/projects/${project}/assets/${asset.id}`)
        if (!result.ok) {
            missing.push(`${asset.name || asset.id} (HTTP ${result.status})`)
            continue
        }
        carried += 1
        fs.writeFileSync(path.join(into, `${String(carried).padStart(4, '0')}${extensionFor(asset)}`), result.buffer)
    }
    if (missing.length) {
        warn(`  ${missing.length} would not come down: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`)
    }
    if (!carried) die(`Nothing came down from ${project}. Is the token right for ${api}?`)
    say(`  ${carried} files in ${into}`)
    return into
}

const args = parseArgs()

export const planSources = (files) => {
    const photos = []
    const videos = []
    const ignored = []
    for (const file of files) {
        const ext = path.extname(file).toLowerCase()
        if (IMAGE_EXTENSIONS.has(ext)) photos.push(file)
        else if (VIDEO_EXTENSIONS.has(ext)) videos.push(file)
        else ignored.push(file)
    }
    return { photos, videos, ignored }
}

// Raw Insta360 files carry a trailer signature; their extensions are not ones
// this pipeline reads, so they arrive in `ignored`. Found by content, not name.
export const findInstaRaw = (files) => files.filter((file) => hasInstaTrailer(file))

const extractVideo = (video, outDir, fps) => {
    ensureDir(outDir)
    // -qscale:v 2 keeps the JPEG close to the source; a re-compressed frame
    // loses exactly the edges the matcher is looking for. Decoding stays on
    // the CPU on purpose: NVENC encodes, it does not make a sharper frame,
    // and the GPU is wanted elsewhere.
    //
    // -pix_fmt yuvj420p is not decoration. A phone's HEVC clip is usually
    // limited-range yuv420p, and ffmpeg 9's mjpeg encoder refuses anything
    // that is not full range — the extraction fails outright and the video
    // silently contributes nothing. Saying the pixel format converts it.
    const base = [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-i', video,
        '-vf', `fps=${fps}`
    ]
    const attempt = run('ffmpeg', [
        ...base, '-pix_fmt', 'yuvj420p', '-qscale:v', '2',
        path.join(outDir, 'frame-%05d.jpg')
    ], { allowFailure: true, stdio: 'pipe' })
    if (attempt.status !== 0) {
        // Some codec/range combinations still refuse JPEG. PNG always works;
        // it costs disk, and disk is cheaper than a lost walk round the hall.
        warn(`    (JPEG frames refused — writing PNG instead for ${path.basename(video)})`)
        run('ffmpeg', [...base, path.join(outDir, 'frame-%05d.png')])
    }
    return fs.readdirSync(outDir)
        .filter((name) => name.endsWith('.jpg') || name.endsWith('.png'))
        .sort()
        .map((name) => path.join(outDir, name))
}

const main = async () => {
    const work = args.work ? path.resolve(String(args.work)) : null
    const space = args['from-space'] ? String(args['from-space']).trim() : null
    if (!work || (!args.from && !space)) {
        die('frames.mjs needs --work <working folder> and either --from <folder of footage> or --from-space <space>.')
    }
    if (space) ensureDir(work)
    let from = args.from ? path.resolve(String(args.from)) : null
    if (space) {
        const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
        const token = readToken(args['token-file'] ? String(args['token-file']) : null)
        if (!token) {
            die(
                'No API token found, so nothing could be pulled.',
                'Set DI_API_TOKEN, or pass --token-file <path to an env file holding ADMIN_API_TOKEN>.'
            )
        }
        if (args['dry-run']) {
            say(`[dry run] would pull ${sourcesProjectId(space)} from ${api} into ${path.join(work, 'pulled')}`)
            return
        }
        from = await pullFromSpace({ space, api, work, token, limit: num(args['max-sources'], 400) })
    }
    if (!fs.existsSync(from)) die(`No such folder: ${from}`)

    const fps = num(args.fps, 2)
    const minFrames = num(args['min-frames'], MIN_USABLE_FRAMES)
    const blurFloor = args['blur-floor'] === undefined ? null : num(args['blur-floor'], null)
    const dryRun = Boolean(args['dry-run'])

    const everything = walkFiles(from)
    const plan = planSources(everything)
    // Raw Insta360 files: found by their trailer, whatever they are called.
    const rawInsta = findInstaRaw([...plan.ignored, ...plan.photos, ...plan.videos])
    const isRaw = new Set(rawInsta)
    const photos = plan.photos.filter((file) => !isRaw.has(file))
    const videos = plan.videos.filter((file) => !isRaw.has(file))
    const ignored = plan.ignored.filter((file) => !isRaw.has(file))
    // Which clips are spheres: ffprobe's projection + aspect, never the name.
    const probed = new Map(videos.map((video) => [video, probeVideo(video)]))
    const videoKind = new Map()
    for (const video of videos) {
        const info = probed.get(video)
        const kind = classifyMedia({ ...info })
        if (kind.kind === 'insta-raw') {
            rawInsta.push(video)
            continue
        }
        videoKind.set(video, kind)
    }
    const flatVideos = videos.filter((video) => videoKind.get(video)?.kind === 'flat')
    const sphereVideos = videos.filter((video) => videoKind.get(video)?.kind === 'equirect')

    say(`Footage in ${from}`)
    say(`  ${photos.length} photos · ${videoKind.size} videos${sphereVideos.length ? ` (${sphereVideos.length} of them 360)` : ''}${ignored.length ? ` · ${ignored.length} other files ignored` : ''}`)
    if (rawInsta.length) {
        warn(`  ${rawInsta.length} raw Insta360 file(s) skipped: ${rawInsta.slice(0, 3).map((f) => path.basename(f)).join(', ')}${rawInsta.length > 3 ? ' …' : ''}`)
        INSTA_EXPORT_HELP.forEach((line) => warn(`    ${line}`))
    }
    if (!photos.length && !videoKind.size) {
        die(
            rawInsta.length ? 'Only raw Insta360 files were found, and those cannot be read directly (see above).' : 'That folder holds no photos and no videos.',
            rawInsta.length ? 'Export them as equirectangular MP4/JPG and run this again.' : 'Drop the footage in first, then run this again.'
        )
    }

    const panoFps = num(args['pano-fps'], 1)
    const maxPano = num(args['max-pano-frames'], 150)
    const rigOptions = {
        horizon: Math.round(num(args.views, 8)),
        up: !args['no-up'],
        fov: num(args['pano-fov'], 90)
    }
    let views
    try {
        views = viewPlan(rigOptions)
    } catch (error) {
        die(error.message)
    }
    let sector
    try {
        sector = parseSector(args['mask-sector'])
    } catch (error) {
        die(error.message)
    }
    const maskBelow = num(args['mask-below'], DEFAULT_MASK_BELOW)

    if (dryRun) {
        say('')
        say('[dry run] would do:')
        flatVideos.forEach((video) => say(`  ffmpeg -i ${video} -vf fps=${fps} → ${path.join(work, 'extracted', path.parse(video).name)}/`))
        sphereVideos.forEach((video) => say(`  360 clip: ffmpeg -i ${video} -vf fps=${panoFps} → spheres, then ${views.length} pinhole views each (${rigOptions.fov}°)`))
        say(`  score ${photos.length} photos + every extracted frame for sharpness and sameness`)
        say(`  copy the keepers into ${path.join(work, 'images')}`)
        return
    }

    ensureDir(work)
    const extractedRoot = path.join(work, 'extracted')
    const candidatePaths = [...photos]
    const sphereFrames = new Set()
    for (const video of flatVideos) {
        const outDir = path.join(extractedRoot, path.parse(video).name)
        say(`  pulling ${fps} fps from ${path.basename(video)} …`)
        const frames = extractVideo(video, outDir, fps)
        say(`    ${frames.length} frames`)
        candidatePaths.push(...frames)
    }
    for (const video of sphereVideos) {
        const outDir = path.join(extractedRoot, path.parse(video).name)
        say(`  pulling ${panoFps} fps of spheres from ${path.basename(video)} (${videoKind.get(video).basis}) …`)
        const frames = extractVideo(video, outDir, panoFps)
        say(`    ${frames.length} spheres`)
        frames.forEach((frame) => sphereFrames.add(frame))
        candidatePaths.push(...frames)
    }

    if (!candidatePaths.length) die('Nothing came out of that footage — no photos and no frames.')

    const python = findPython(['cv2', 'numpy'])
    say(`  scoring ${candidatePaths.length} frames for sharpness and sameness …`)
    const stats = runPythonJson(python, path.join(PLACE_DIR, 'frame-stats.py'), candidatePaths)
    const bySource = (file) => (photos.includes(file) ? 'photo' : 'video')
    const candidates = stats.map((entry) => ({ ...entry, source: bySource(entry.path) }))
    // A photo is a sphere by its XMP and its 2:1 shape; a frame is one because its clip is.
    for (const entry of candidates) {
        if (sphereFrames.has(entry.path)) {
            entry.pano = true
        } else if (entry.source === 'photo') {
            const kind = classifyMedia({ width: entry.width, height: entry.height, projection: readGPano(entry.path) })
            entry.pano = kind.kind === 'equirect'
            if (entry.pano) entry.panoBasis = kind.basis
        }
        if (entry.pano) entry.source = `${entry.source}360`
    }
    const flatCandidates = candidates.filter((entry) => !entry.pano)
    const sphereCandidates = candidates.filter((entry) => entry.pano)

    // Flat and sphere pictures are scored in their own batches: Laplacian
    // variance and hashes of a 2:1 sheet are not comparable with a phone frame.
    const flatPick = selectFrames(flatCandidates, { blurFloor })
    const spherePick = sphereCandidates.length
        ? selectFrames(sphereCandidates, { blurFloor })
        : { kept: [], rejected: [], blurFloor: 0 }
    const thinned = thinEvenly(spherePick.kept, maxPano)
    const kept = flatPick.kept
    const rejected = [...flatPick.rejected, ...spherePick.rejected]
    const floor = flatPick.blurFloor

    const imagesDir = path.join(work, 'images')
    fs.rmSync(imagesDir, { recursive: true, force: true })
    ensureDir(imagesDir)
    const keptRecords = kept.map((entry, index) => {
        const name = `frame-${String(index + 1).padStart(5, '0')}${path.extname(entry.path).toLowerCase() || '.jpg'}`
        fs.copyFileSync(entry.path, path.join(imagesDir, name))
        return {
            name,
            from: entry.path,
            source: entry.source,
            sharpness: Number(entry.sharpness.toFixed(2)),
            hash: entry.hash,
            width: entry.width,
            height: entry.height
        }
    })

    // Spheres → pinhole views, all sharing one centre per sphere (the rig).
    let panorama = null
    if (thinned.length) {
        const size = args['view-size'] ? Math.round(num(args['view-size'], 0)) : viewSize(Math.max(...thinned.map((entry) => entry.width)), rigOptions.fov)
        say(`  cutting ${thinned.length} spheres into ${views.length} views each (${rigOptions.fov}° · ${size} px) …`)
        const cut = runPythonJson(python, path.join(PLACE_DIR, 'split360.py'), {
            frames: thinned.map((entry, index) => ({ path: entry.path, base: `pano-${String(index + 1).padStart(5, '0')}` })),
            out: imagesDir, views, size, maskBelow, maskSector: sector, dropMasked: 0.5
        })
        const byBase = new Map(thinned.map((entry, index) => [`pano-${String(index + 1).padStart(5, '0')}`, entry]))
        const rig = []
        let dropped = 0
        for (const piece of cut) {
            if (piece.error) { warn(`    ${piece.base}: ${piece.error}`); continue }
            if (piece.dropped) { dropped += 1; continue }
            const entry = byBase.get(piece.base)
            keptRecords.push({
                name: piece.name,
                from: entry.path,
                source: entry.source,
                sharpness: Number(entry.sharpness.toFixed(2)),
                hash: entry.hash,
                width: piece.size,
                height: piece.size,
                sphere: piece.base,
                view: { index: piece.index, yaw: piece.yaw, pitch: piece.pitch, fov: piece.fov },
                maskedFraction: piece.maskedFraction
            })
            let sphere = rig.find((item) => item.sphere === piece.base)
            if (!sphere) { sphere = { sphere: piece.base, from: entry.path, views: [] }; rig.push(sphere) }
            sphere.views.push({ name: piece.name, index: piece.index, yaw: piece.yaw, pitch: piece.pitch })
        }
        panorama = {
            spheres: thinned.length, spheresScored: sphereCandidates.length, viewsPerSphere: views.length,
            viewsWritten: keptRecords.filter((r) => r.sphere).length, viewsDroppedMasked: dropped,
            fov: rigOptions.fov, size, maskBelow, maskSector: sector, fps: panoFps, maxSpheres: maxPano
        }
        // One centre per sphere: Meshroom's Split360Images writes the same relation as rig.sfm.
        writeJson(path.join(work, 'rig.json'), {
            tool: 'scripts/place/split360.py',
            note: 'Views of one sphere share one optical centre (a rig). The Meshroom batch used by colab-job.mjs reads a folder of pictures and does not use this relation; it is kept for a rig-aware build.',
            ...panorama, rig
        })
    }

    const verdict = framesVerdict(keptRecords.length, rejected, minFrames)
    writeJson(path.join(work, 'frames.json'), {
        tool: 'scripts/place/frames.mjs',
        createdAt: new Date().toISOString(),
        from,
        fps,
        minFrames,
        blurFloor: Number(floor.toFixed(2)),
        counts: {
            photos: photos.length,
            videos: videoKind.size,
            spheresKept: thinned.length,
            candidates: candidates.length,
            kept: keptRecords.length,
            rejectedBlurry: verdict.blurry,
            rejectedDuplicate: verdict.duplicates
        },
        ok: verdict.ok,
        imagesDir,
        panorama,
        images: keptRecords,
        rejected: rejected.map((entry) => ({
            path: entry.path,
            reason: entry.reason,
            sharpness: Number.isFinite(entry.sharpness) ? Number(entry.sharpness.toFixed(2)) : null,
            distance: Number.isFinite(entry.distance) ? entry.distance : null
        }))
    })

    if (!args['keep-extracted']) fs.rmSync(extractedRoot, { recursive: true, force: true })

    say('')
    verdict.lines.forEach((line) => say(line))
    say('')
    say(`Frames for the reconstruction: ${imagesDir}`)
    say(`The full count: ${path.join(work, 'frames.json')}`)
    if (!verdict.ok) {
        warn('')
        warn('Stopping here: that is not enough to build a room from.')
        process.exit(2)
    }
}

if (process.argv[1] && process.argv[1].endsWith('frames.mjs')) await main()
