// HOW SHARP IS THIS FRAME — the one number the coach is built on.
//
// A reconstruction is built from matched corners, and a blurred frame has no
// corners to match. frames.mjs already throws the blurry ones out AFTER the
// walk (scripts/place/frames-lib.mjs, the same measure), which is the wrong
// time to find out: the hall is behind you. So the phone measures the same
// thing live and says "slower" while there is still time to walk slower.
//
// The measure is the VARIANCE OF THE LAPLACIAN: convolve the grey channel with
// the four-neighbour Laplacian and take the variance of what comes back. A
// sharp picture has strong second derivatives scattered all over it and a wide
// spread; a blurred one has almost none and a narrow spread. It is the same
// measure OpenCV's `cv2.Laplacian(…).var()` computes, which is what
// frame-stats.py runs on the server side — so a frame the phone called sharp is
// a frame the pipeline will also call sharp.
//
// It is NOT a physical quantity and it has no units. The number depends on the
// sampled width, the picture's content and the exposure, so it is only ever
// compared against other frames of the SAME walk. That is why there is no
// absolute "sharp" threshold in here: the caller carries a floor read off its
// own stream (`SHARP_ENOUGH` is a starting point, not a truth).
//
// Measured on a 160-px-wide sample on purpose. At full phone resolution this is
// tens of millions of multiplies four times a second and the preview stutters;
// at 160 px it is about 25k and free. Downsampling low-passes the picture,
// which lowers every score — including the floor, which is read off the same
// samples, so the comparison survives.

export const SAMPLE_WIDTH = 160

// Where "sharp enough to count" starts on a 160-px sample, before the walk has
// said anything. Deliberately generous: counting a soft frame costs one number
// on a screen, refusing a good one costs a walk done twice.
export const SHARP_ENOUGH = 8

/**
 * Laplacian variance of one frame.
 *
 * @param {{data: Uint8ClampedArray|number[], width: number, height: number}} image
 *        RGBA pixels, the shape `CanvasRenderingContext2D.getImageData` returns.
 * @returns {number} the variance — 0 for anything too small to convolve.
 */
export const laplacianVariance = (image) => {
    const width = Math.floor(Number(image?.width) || 0)
    const height = Math.floor(Number(image?.height) || 0)
    const data = image?.data
    if (!data || width < 3 || height < 3) return 0
    if (data.length < width * height * 4) return 0

    // Rec. 601 luma, integer-weighted: the grey a person sees, and the same
    // channel cv2.cvtColor(…, COLOR_BGR2GRAY) hands the Python side.
    const grey = new Float32Array(width * height)
    for (let index = 0, pixel = 0; pixel < grey.length; pixel += 1, index += 4) {
        grey[pixel] = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
    }

    // One pass, Welford-free: the response of a Laplacian over a real picture
    // is small and centred near zero, so the naive sum-of-squares is stable
    // here and half the arithmetic of a two-pass mean.
    let sum = 0
    let sumSquares = 0
    let count = 0
    for (let y = 1; y < height - 1; y += 1) {
        const row = y * width
        for (let x = 1; x < width - 1; x += 1) {
            const at = row + x
            const response = grey[at - 1] + grey[at + 1] + grey[at - width] + grey[at + width] - 4 * grey[at]
            sum += response
            sumSquares += response * response
            count += 1
        }
    }
    if (!count) return 0
    const mean = sum / count
    // Population variance, matching numpy's `.var()` default (ddof=0) — the
    // server measures the same way, and a frame must not be sharp on one side
    // of the seam and soft on the other.
    return Math.max(0, sumSquares / count - mean * mean)
}

/**
 * The size to sample a video frame at: SAMPLE_WIDTH wide, the picture's own
 * shape, never bigger than the source. A stream that has not started yet
 * reports 0×0, and there is nothing to measure.
 */
export const sampleSize = (sourceWidth, sourceHeight, targetWidth = SAMPLE_WIDTH) => {
    const width = Math.floor(Number(sourceWidth) || 0)
    const height = Math.floor(Number(sourceHeight) || 0)
    if (width < 1 || height < 1) return { width: 0, height: 0 }
    const scaled = Math.min(width, Math.max(3, Math.floor(targetWidth)))
    return {
        width: scaled,
        height: Math.max(3, Math.round(height * (scaled / width)))
    }
}

/**
 * WHAT THE COACH SHOULD SAY, from the last few readings and nothing else.
 *
 * "Slower" is the only hint sharpness can honestly give: at a fixed exposure a
 * frame goes soft because the phone moved during it, and walking slower is the
 * one thing a person can do about that. So the hint fires on a DROP against
 * what this walk has already managed, never on an absolute number — a dim hall
 * scores low all the way through and does not need to be told to slow down for
 * five minutes.
 *
 * @param {number[]} readings most recent LAST, oldest first.
 * @returns {{sharpness: number, floor: number, sharp: boolean, hint: string}}
 */
export const readSharpness = (readings = [], { sharpEnough = SHARP_ENOUGH } = {}) => {
    const list = (Array.isArray(readings) ? readings : []).filter((value) => Number.isFinite(value) && value >= 0)
    if (!list.length) return { sharpness: 0, floor: 0, sharp: false, hint: '' }
    const sharpness = list[list.length - 1]
    // The floor this walk has earned: the median of what it has seen, halved.
    // A median rather than a mean because one frame of a dark doorway must not
    // move the bar for the whole hall.
    const sorted = [...list].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const floor = Math.max(sharpEnough, median * 0.5)
    const sharp = sharpness >= floor
    // Three readings is about 1.2 s at the 400 ms sampling rate — long enough
    // that a single frame spoiled by a passing shadow says nothing.
    const recent = list.slice(-3)
    const droppingHard = recent.length === 3 && recent.every((value) => value < median * 0.5)
    return {
        sharpness,
        floor,
        sharp,
        hint: droppingHard ? 'slower' : ''
    }
}
