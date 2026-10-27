// pano-lib.mjs — the pure part of 360 input for the place pipeline.
//
// An Insta360 (or any 360) camera gives an equirectangular picture: the whole
// sphere on a 2:1 sheet. A reconstruction wants ordinary pinhole pictures. This
// file decides (1) WHAT a file is, by what is inside it and never by its name,
// and (2) WHICH pinhole views to cut out of each sphere.
//
// Method, cited (nothing invented here):
//   * Cutting a sphere into virtual pinhole cameras that share one centre is the
//     practice of COLMAP's `panorama_sfm.py` (colmap/scripts/python) and of
//     AliceVision/Meshroom's Split360Images node (equirectangular mode: N yaw
//     splits, FOV default 110°, writes a rig.sfm). We use the same idea.
//   * Metadata that says "this is a sphere": Google Photo Sphere XMP
//     (GPano:ProjectionType = equirectangular) for pictures, and the ISO-BMFF /
//     Spherical Video V2 projection that ffprobe reports as side data
//     "Spherical Mapping" (projection equirectangular) for clips.
//   * Insta360 raw files (.insv / .insp, dual fisheye) end with a fixed 32-byte
//     trailer signature. That signature is how exiftool's Insta360 reader and
//     community parsers recognise them; Insta360 publishes no open spec, so this
//     detection is UNVALIDATED against an owner file (see README).
import fs from 'node:fs'
import { run } from './common.mjs'

/** The view rig: how many pinhole cameras, where they look, how wide. */
export const DEFAULT_RIG = Object.freeze({ horizon: 8, up: true, fov: 90 })
export const MAX_VIEW_PX = 2400
export const MIN_VIEW_PX = 640
export const DEFAULT_MASK_BELOW = 60 // degrees below the horizon: the photographer's pole and feet

const round2 = (value) => Math.round(value * 100) / 100

/**
 * Where the virtual cameras look. `horizon` cameras evenly round the horizon
 * (pitch 0), plus one looking straight up when `up` (halls have ceilings worth
 * matching: trusses, lanterns). Nothing looks down: the bottom of the sphere is
 * the photographer.
 *
 * Why 8 at 90°: neighbours 45° apart overlap by 45° (50 %), enough for the
 * matcher to tie them without making 12+ near-duplicate pictures per frame; a
 * 90° pinhole keeps perspective stretch at the edge to tan(45°)=1, the usual
 * ceiling before corners smear (Meshroom's own default is 110° with 2 splits).
 * 6 views at 90° (a plain cubemap) would have zero overlap between neighbours.
 */
export const viewPlan = ({ horizon = DEFAULT_RIG.horizon, up = DEFAULT_RIG.up, fov = DEFAULT_RIG.fov } = {}) => {
    if (!Number.isInteger(horizon) || horizon < 3) throw new Error('a rig needs at least 3 views round the horizon')
    if (!(fov >= 40 && fov <= 140)) throw new Error('the field of view must be between 40 and 140 degrees')
    const views = []
    for (let k = 0; k < horizon; k += 1) views.push({ index: views.length, yaw: round2((360 * k) / horizon), pitch: 0, fov })
    if (up) views.push({ index: views.length, yaw: 0, pitch: 90, fov })
    return views
}

/** Pixels per view side: the sphere's own density at that FOV, so nothing is invented by upscaling. */
export const viewSize = (equirectWidth, fov) => {
    const natural = Math.round((equirectWidth * fov) / 360)
    return Math.max(MIN_VIEW_PX, Math.min(MAX_VIEW_PX, natural))
}

/** Is a width:height pair a 2:1 sheet (±1 %)? */
export const isTwoToOne = (width, height) => width > 0 && height > 0 && Math.abs(width / height - 2) <= 0.02

/**
 * Decide what a file is. Order matters: a raw Insta360 file can also be 2:1
 * (a dual-fisheye sheet), so the signature is checked BEFORE the aspect.
 *   { kind: 'equirect' | 'insta-raw' | 'flat', basis, ... }
 */
export const classifyMedia = ({ width = 0, height = 0, projection = null, instaTrailer = false, dualStream = false } = {}) => {
    if (instaTrailer) return { kind: 'insta-raw', basis: 'Insta360 trailer signature' }
    if (dualStream) return { kind: 'insta-raw', basis: 'two square video streams (dual fisheye)' }
    if (projection === 'equirectangular') {
        return isTwoToOne(width, height)
            ? { kind: 'equirect', basis: 'spherical metadata + 2:1' }
            // A cropped sphere (GPano with a partial field of view) is not a full sheet.
            : { kind: 'flat', basis: 'spherical metadata but not 2:1 (a partial panorama; used as a flat picture)' }
    }
    if (isTwoToOne(width, height) && width >= 1440) return { kind: 'equirect', basis: 'aspect 2:1, no metadata' }
    return { kind: 'flat', basis: 'ordinary picture' }
}

export const INSTA_TRAILER = Buffer.from('8db42d694ccc418790edff439fe026bf', 'latin1')

/** The last 32 bytes of the file are Insta360's signature. */
export const hasInstaTrailer = (file) => {
    let handle
    try {
        handle = fs.openSync(file, 'r')
        const size = fs.fstatSync(handle).size
        if (size < INSTA_TRAILER.length) return false
        const tail = Buffer.alloc(INSTA_TRAILER.length)
        fs.readSync(handle, tail, 0, tail.length, size - tail.length)
        return tail.equals(INSTA_TRAILER)
    } catch {
        return false
    } finally {
        if (handle !== undefined) fs.closeSync(handle)
    }
}

/** XMP GPano:ProjectionType from the first 256 KB of a JPEG (where APP1 XMP lives). */
export const readGPano = (file) => {
    let handle
    try {
        handle = fs.openSync(file, 'r')
        const head = Buffer.alloc(256 * 1024)
        const got = fs.readSync(handle, head, 0, head.length, 0)
        return parseGPano(head.subarray(0, got).toString('latin1'))
    } catch {
        return null
    } finally {
        if (handle !== undefined) fs.closeSync(handle)
    }
}

export const parseGPano = (text) => {
    const match = /GPano:ProjectionType\s*(?:=\s*["']|>\s*)([A-Za-z]+)/.exec(text)
    return match ? match[1].toLowerCase() : null
}

/** Read the projection and size of a clip from ffprobe's JSON. Streams, not names. */
export const parseFfprobe = (json) => {
    const streams = Array.isArray(json?.streams) ? json.streams.filter((s) => s.codec_type === 'video') : []
    const main = streams[0] || {}
    const side = streams.flatMap((s) => (Array.isArray(s.side_data_list) ? s.side_data_list : []))
    const spherical = side.find((entry) => /spherical/i.test(String(entry.side_data_type || '')))
    const projection = spherical ? String(spherical.projection || '').toLowerCase() : null
    const square = (s) => s.width > 0 && Math.abs(s.width / s.height - 1) <= 0.05
    return {
        width: Number(main.width) || 0,
        height: Number(main.height) || 0,
        projection: projection || null,
        // An .insv holds the two lenses as two separate square streams.
        dualStream: streams.length >= 2 && streams.every(square)
    }
}

export const probeVideo = (file) => {
    const result = run('ffprobe', [
        '-v', 'error', '-print_format', 'json', '-show_streams', file
    ], { allowFailure: true, stdio: 'pipe', encoding: 'utf8' })
    if (result.status !== 0) return { width: 0, height: 0, projection: null, dualStream: false }
    try {
        return parseFfprobe(JSON.parse(result.stdout))
    } catch {
        return { width: 0, height: 0, projection: null, dualStream: false }
    }
}

/** Raw Insta360 → plain words for the owner. */
export const INSTA_EXPORT_HELP = [
    'These are raw Insta360 files (dual fisheye). This pipeline reads the stitched export, not the raw file.',
    'In Insta360 Studio (free desktop app): open the file, Export, choose "Export Video" / "Export Image",',
    'format MP4 / JPG, "Panoramic" (not Reframe), the highest resolution, "Stabilization on" is fine.',
    'Drop the exported .mp4 / .jpg here instead. (Insta360\'s SDK is not bundled: it is licensed to registered developers.)'
]

/** Keep at most `max` items, evenly spread (a long walk must not make thousands of views). */
export const thinEvenly = (items, max) => {
    if (!Number.isFinite(max) || max <= 0 || items.length <= max) return items
    const picked = []
    for (let k = 0; k < max; k += 1) picked.push(items[Math.floor(((k + 0.5) * items.length) / max)])
    return picked
}

/** "180:50" → { yaw: 180, half: 50 } — a sector of yaw to black out (a person behind the camera). */
export const parseSector = (text) => {
    if (!text) return null
    const match = /^(-?\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(text).trim())
    if (!match) throw new Error('--mask-sector wants yaw:halfwidth in degrees, e.g. 180:50')
    return { yaw: Number(match[1]), half: Number(match[2]) }
}
