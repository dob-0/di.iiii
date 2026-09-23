// Picking the frames a reconstruction can actually use.
//
// Pure functions only — no disk, no ffmpeg, no python — so the choosing can be
// tested on made-up numbers. `frames.mjs` does the walking, extracting and
// copying and hands the numbers here.
//
// Two things get a frame thrown out:
//   blurry        — a smeared frame poisons the match; photogrammetry would
//                   rather have 80 sharp frames than 400 with 200 soft ones.
//   near-duplicate— two frames of the same wall from the same spot cost GPU
//                   minutes and add nothing. We keep the sharper one.

// Sharpness here is the variance of the Laplacian (see frame-stats.py): high
// for crisp edges, near zero for a smeared frame. Absolute values depend on
// the camera, so the floor is relative to the batch's own median — but never
// below this, or an entirely smeared shoot would "pass" by comparing itself
// to itself.
export const ABSOLUTE_BLUR_FLOOR = 12
export const BLUR_FLOOR_FRACTION = 0.35
// Perceptual-hash distance (out of 64 bits) at or under which two frames are
// the same picture. 6 is about "same wall, camera barely moved".
export const DUPLICATE_DISTANCE = 6
// A near-duplicate only unseats the frame it duplicates if it is clearly
// sharper, not a percent better — otherwise noise decides which one we keep.
export const SHARPER_MARGIN = 1.15
// Below this a reconstruction is not worth the GPU minutes. Meshroom will
// produce *something* from 30 frames; it will not be a room.
export const MIN_USABLE_FRAMES = 60

export const median = (values) => {
    const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b)
    if (!sorted.length) return 0
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Hamming distance between two hex-encoded perceptual hashes. Different
// lengths (or junk) means "not comparable", i.e. as far apart as possible.
export const hammingHex = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return Infinity
    let distance = 0
    for (let index = 0; index < a.length; index += 1) {
        const left = Number.parseInt(a[index], 16)
        const right = Number.parseInt(b[index], 16)
        if (!Number.isFinite(left) || !Number.isFinite(right)) return Infinity
        let xor = left ^ right
        while (xor) {
            distance += xor & 1
            xor >>= 1
        }
    }
    return distance
}

export const blurFloorFor = (candidates, override = null) => {
    if (Number.isFinite(override)) return Number(override)
    const mid = median(candidates.map((candidate) => candidate.sharpness))
    return Math.max(ABSOLUTE_BLUR_FLOOR, mid * BLUR_FLOOR_FRACTION)
}

/**
 * Choose the frames worth uploading.
 *
 * @param {Array<{path: string, sharpness: number, hash: string, source?: string}>} candidates
 *        In capture order — a video's frames in time order, photos by filename.
 * @returns {{kept: Array, rejected: Array, blurFloor: number}}
 */
export const selectFrames = (candidates = [], options = {}) => {
    const list = Array.isArray(candidates) ? candidates.filter((entry) => entry && entry.path) : []
    const blurFloor = blurFloorFor(list, options.blurFloor)
    const duplicateDistance = Number.isFinite(options.duplicateDistance)
        ? Number(options.duplicateDistance)
        : DUPLICATE_DISTANCE

    const rejected = []
    const sharp = []
    for (const candidate of list) {
        const sharpness = Number(candidate.sharpness)
        if (!Number.isFinite(sharpness) || sharpness < blurFloor) {
            rejected.push({ ...candidate, reason: 'blurry', blurFloor })
            continue
        }
        sharp.push(candidate)
    }

    const kept = []
    for (const candidate of sharp) {
        const previous = kept[kept.length - 1]
        if (!previous) {
            kept.push(candidate)
            continue
        }
        const distance = hammingHex(previous.hash, candidate.hash)
        if (distance > duplicateDistance) {
            kept.push(candidate)
            continue
        }
        // Same picture twice. Keep whichever is clearly sharper; a tie keeps
        // the one already standing, so the result never depends on noise.
        if (candidate.sharpness > previous.sharpness * SHARPER_MARGIN) {
            kept[kept.length - 1] = candidate
            rejected.push({ ...previous, reason: 'near-duplicate', distance })
        } else {
            rejected.push({ ...candidate, reason: 'near-duplicate', distance })
        }
    }

    return { kept, rejected, blurFloor }
}

// What to say out loud. The owner is not reading a JSON file at 2am.
export const framesVerdict = (keptCount, rejected = [], minimum = MIN_USABLE_FRAMES) => {
    const blurry = rejected.filter((entry) => entry.reason === 'blurry').length
    const duplicates = rejected.filter((entry) => entry.reason === 'near-duplicate').length
    const lines = [
        `${keptCount} frames kept · ${blurry} too blurry · ${duplicates} the same picture twice`
    ]
    if (keptCount < minimum) {
        lines.push(
            `NOT ENOUGH. A room needs about ${minimum} usable frames and this footage gives ${keptCount}.`,
            'Walk the hall again: keep moving, overlap each shot with the last by about two thirds,',
            'hold still for each frame, and get the corners and the ceiling as well as the walls.'
        )
    }
    return { ok: keptCount >= minimum, blurry, duplicates, kept: keptCount, lines }
}
