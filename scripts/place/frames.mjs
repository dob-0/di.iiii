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

    const { photos, videos, ignored } = planSources(walkFiles(from))
    say(`Footage in ${from}`)
    say(`  ${photos.length} photos · ${videos.length} videos${ignored.length ? ` · ${ignored.length} other files ignored` : ''}`)
    if (!photos.length && !videos.length) {
        die(
            'That folder holds no photos and no videos.',
            'Drop the footage in first, then run this again.'
        )
    }

    if (dryRun) {
        say('')
        say('[dry run] would do:')
        videos.forEach((video) => say(`  ffmpeg -i ${video} -vf fps=${fps} → ${path.join(work, 'extracted', path.parse(video).name)}/`))
        say(`  score ${photos.length} photos + every extracted frame for sharpness and sameness`)
        say(`  copy the keepers into ${path.join(work, 'images')}`)
        return
    }

    ensureDir(work)
    const extractedRoot = path.join(work, 'extracted')
    const candidatePaths = [...photos]
    for (const video of videos) {
        const outDir = path.join(extractedRoot, path.parse(video).name)
        say(`  pulling ${fps} fps from ${path.basename(video)} …`)
        const frames = extractVideo(video, outDir, fps)
        say(`    ${frames.length} frames`)
        candidatePaths.push(...frames)
    }

    if (!candidatePaths.length) die('Nothing came out of that footage — no photos and no frames.')

    const python = findPython(['cv2', 'numpy'])
    say(`  scoring ${candidatePaths.length} frames for sharpness and sameness …`)
    const stats = runPythonJson(python, path.join(PLACE_DIR, 'frame-stats.py'), candidatePaths)
    const bySource = (file) => (photos.includes(file) ? 'photo' : 'video')
    const candidates = stats.map((entry) => ({ ...entry, source: bySource(entry.path) }))

    const { kept, rejected, blurFloor: floor } = selectFrames(candidates, { blurFloor })

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
            videos: videos.length,
            candidates: candidates.length,
            kept: keptRecords.length,
            rejectedBlurry: verdict.blurry,
            rejectedDuplicate: verdict.duplicates
        },
        ok: verdict.ok,
        imagesDir,
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
