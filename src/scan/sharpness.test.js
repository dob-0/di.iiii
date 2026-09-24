import { describe, expect, it } from 'vitest'
import { laplacianVariance, readSharpness, sampleSize, SHARP_ENOUGH } from './sharpness.js'

// A grey RGBA buffer from a function of x and y, the shape getImageData returns.
const image = (width, height, grey) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const at = (y * width + x) * 4
            const value = Math.max(0, Math.min(255, grey(x, y)))
            data[at] = value
            data[at + 1] = value
            data[at + 2] = value
            data[at + 3] = 255
        }
    }
    return { data, width, height }
}

describe('laplacianVariance', () => {
    // The floor case, and the reason the measure works at all: a picture with no
    // edges in it has no second derivative anywhere, so the variance is zero. A
    // fully defocused frame is this picture.
    it('is zero for a flat field', () => {
        expect(laplacianVariance(image(32, 32, () => 128))).toBe(0)
    })

    // A linear ramp has a constant FIRST derivative and a zero second one, so it
    // also scores zero. This is the case that proves the measure reads edges and
    // not brightness or contrast: the ramp goes from black to white.
    it('is zero for a smooth gradient, however strong', () => {
        expect(laplacianVariance(image(32, 32, (x) => x * 8))).toBeCloseTo(0, 6)
    })

    it('rises with the sharpness of the same picture', () => {
        const hardEdge = image(32, 32, (x) => (x < 16 ? 0 : 255))
        // The same edge, smeared over four pixels — what camera shake does.
        const softEdge = image(32, 32, (x) => Math.max(0, Math.min(255, (x - 14) * 64)))
        expect(laplacianVariance(hardEdge)).toBeGreaterThan(laplacianVariance(softEdge))
        expect(laplacianVariance(softEdge)).toBeGreaterThan(0)
    })

    it('scores a checkerboard — the densest edges there are — highest of all', () => {
        const checks = image(32, 32, (x, y) => ((x + y) % 2 ? 255 : 0))
        const oneEdge = image(32, 32, (x) => (x < 16 ? 0 : 255))
        expect(laplacianVariance(checks)).toBeGreaterThan(laplacianVariance(oneEdge))
    })

    // A stream that has not started yet reports 0×0, and a getImageData call on
    // it returns an empty buffer. Measuring must answer, not throw: this runs on
    // a timer four times a second from the moment the page opens.
    it('answers 0 rather than throwing on nothing to measure', () => {
        expect(laplacianVariance(null)).toBe(0)
        expect(laplacianVariance({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBe(0)
        expect(laplacianVariance({ width: 2, height: 2, data: new Uint8ClampedArray(16) })).toBe(0)
        // A buffer shorter than the size it claims — a partially painted canvas.
        expect(laplacianVariance({ width: 32, height: 32, data: new Uint8ClampedArray(64) })).toBe(0)
    })
})

describe('sampleSize', () => {
    it('keeps the picture\'s own shape at the sampled width', () => {
        expect(sampleSize(1920, 1080)).toEqual({ width: 160, height: 90 })
        expect(sampleSize(1080, 1920)).toEqual({ width: 160, height: 284 })
    })

    it('never samples bigger than the source', () => {
        expect(sampleSize(64, 48)).toEqual({ width: 64, height: 48 })
    })

    it('says nothing for a stream that has not started', () => {
        expect(sampleSize(0, 0)).toEqual({ width: 0, height: 0 })
    })
})

describe('readSharpness', () => {
    it('says nothing before the first reading', () => {
        expect(readSharpness([])).toEqual({ sharpness: 0, floor: 0, sharp: false, hint: '' })
    })

    it('reports the latest reading against a floor this walk earned', () => {
        const reading = readSharpness([100, 120, 110, 105])
        expect(reading.sharpness).toBe(105)
        expect(reading.floor).toBeCloseTo(55, 5)
        expect(reading.sharp).toBe(true)
    })

    // The honest hint: "slower" fires on a DROP against what this walk has
    // already managed, never on an absolute number.
    it('asks for slower only when sharpness has been falling for three readings', () => {
        expect(readSharpness([100, 100, 100, 100, 20, 18, 15]).hint).toBe('slower')
        expect(readSharpness([100, 100, 100, 100, 20]).hint).toBe('')
        expect(readSharpness([100, 100, 100, 100, 95, 98, 96]).hint).toBe('')
    })

    // A dim hall scores low all the way through. It must not be told to slow
    // down for five minutes for being dim.
    it('never nags a walk that is simply dark throughout', () => {
        expect(readSharpness([9, 10, 9, 11, 10, 9, 10]).hint).toBe('')
    })

    it('never lets the floor fall below the starting bar', () => {
        expect(readSharpness([0, 0, 0]).floor).toBe(SHARP_ENOUGH)
    })
})
