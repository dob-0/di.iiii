import { describe, expect, it } from 'vitest'
import {
    applyHomography,
    cornerPinTransform,
    cornersToPixels,
    homographyToMatrix3d,
    inverseHomography,
    isDegenerateQuad,
    maskToClipPath,
    quadSignedArea,
    solveHomography,
    guideCandidates,
    snapToGrid,
    snapToGuides,
    solveLinearSystem,
    surfaceFilter
} from './cornerPin.js'

const UNIT = [[0, 0], [100, 0], [100, 100], [0, 100]]
const round = (value, places = 6) => Number(value.toFixed(places))

describe('solveLinearSystem', () => {
    it('solves a well-conditioned system', () => {
        const solution = solveLinearSystem([[2, 1], [1, 3]], [5, 10])
        expect(solution.map((value) => round(value, 9))).toEqual([1, 3])
    })

    it('returns null rather than Infinity for a singular matrix', () => {
        expect(solveLinearSystem([[1, 2], [2, 4]], [3, 6])).toBeNull()
    })
})

describe('solveHomography', () => {
    it('maps every corner exactly onto its target', () => {
        const destination = [[20, 0], [180, 10], [200, 120], [0, 100]]
        const h = solveHomography(UNIT, destination)
        UNIT.forEach((point, index) => {
            const mapped = applyHomography(h, point).map((value) => round(value, 6))
            expect(mapped).toEqual(destination[index])
        })
    })

    it('is exactly invertible through the interior', () => {
        const destination = [[20, 0], [180, 10], [200, 120], [0, 100]]
        const forward = solveHomography(UNIT, destination)
        const back = inverseHomography(UNIT, destination)
        const centre = applyHomography(forward, [50, 50])
        expect(applyHomography(back, centre).map((value) => round(value, 6))).toEqual([50, 50])
    })

    it('returns null on a degenerate quad instead of throwing', () => {
        expect(solveHomography(UNIT, [[0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull()
    })

    it('returns null when a coordinate is not a number', () => {
        expect(solveHomography(UNIT, [[0, 0], [1, 0], [1, 'x'], [0, 1]])).toBeNull()
    })
})

describe('homographyToMatrix3d', () => {
    it('emits the identity for an untouched rectangle', () => {
        expect(cornerPinTransform(100, 100, UNIT)).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)')
    })

    it('puts a translation in the fourth column, not the perspective row', () => {
        const transform = cornerPinTransform(100, 100, [[10, 10], [110, 10], [110, 110], [10, 110]])
        expect(transform).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 10, 0, 1)')
    })

    it('produces a non-zero perspective term for a keystone', () => {
        // This is the whole point: an affine transform cannot keystone, so a
        // zero here would mean surfaces that never sit flat on the wall.
        const transform = cornerPinTransform(100, 100, [[20, 0], [80, 0], [100, 100], [0, 100]])
        const numbers = transform.slice('matrix3d('.length, -1).split(',').map((part) => Number(part.trim()))
        expect(numbers).toHaveLength(16)
        // Row 4 of the matrix, held in slots 3, 7, 11, 15 of the column-major
        // list. Both in-plane perspective terms being zero is exactly the
        // affine case a corner-pin must not collapse to.
        expect(numbers[3] === 0 && numbers[7] === 0).toBe(false)
    })

    it('has no output for a collapsed quad', () => {
        expect(cornerPinTransform(100, 100, [[0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull()
        expect(homographyToMatrix3d(null)).toBeNull()
    })

    it('refuses a zero-sized source box', () => {
        expect(cornerPinTransform(0, 100, UNIT)).toBeNull()
    })
})

describe('normalised corners', () => {
    it('scale to whatever the output happens to be', () => {
        // A mapping aligned on a laptop has to land unchanged on the
        // projector; that only holds if corners are stored normalised.
        const corners = [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]]
        expect(cornersToPixels(corners, 1920, 1080)).toEqual([[0, 0], [960, 0], [960, 540], [0, 540]])
        expect(cornersToPixels(corners, 1280, 720)).toEqual([[0, 0], [640, 0], [640, 360], [0, 360]])
    })
})

describe('quadSignedArea', () => {
    it('reports a mirrored quad as negative rather than repairing it', () => {
        expect(quadSignedArea(UNIT)).toBeGreaterThan(0)
        expect(quadSignedArea([...UNIT].reverse())).toBeLessThan(0)
    })

    it('flags a collapsed quad', () => {
        expect(isDegenerateQuad([[0, 0], [1, 1], [2, 2], [3, 3]])).toBe(true)
        expect(isDegenerateQuad(UNIT)).toBe(false)
    })
})

describe('maskToClipPath', () => {
    it('is none for a mask that cannot enclose anything', () => {
        expect(maskToClipPath([])).toBe('none')
        expect(maskToClipPath([[0, 0], [1, 1]])).toBe('none')
    })

    it('emits percentages of the surface, not pixels', () => {
        expect(maskToClipPath([[0, 0], [1, 0], [0.5, 1]]))
            .toBe('polygon(0.0000% 0.0000%, 100.0000% 0.0000%, 50.0000% 100.0000%)')
    })
})

describe('surfaceFilter', () => {
    it('is none when nothing was changed, so no needless compositing layer', () => {
        expect(surfaceFilter({})).toBe('none')
    })

    it('chains only the controls that moved', () => {
        expect(surfaceFilter({ brightness: 0.8, hue: 30 })).toBe('brightness(0.8) hue-rotate(30deg)')
    })
})

describe('snapping', () => {
    it('leaves a point alone when there is no grid', () => {
        expect(snapToGrid([0.333, 0.777], 0)).toEqual([0.333, 0.777])
    })

    it('rounds onto the grid', () => {
        const [x, y] = snapToGrid([0.26, 0.74], 4)
        expect(x).toBeCloseTo(0.25, 6)
        expect(y).toBeCloseTo(0.75, 6)
    })

    it('snaps x and y independently, so a corner can take a height without a column', () => {
        const result = snapToGuides([0.402, 0.9], [[0.4, 0.1]], 0.01)
        expect(result.point[0]).toBeCloseTo(0.4, 6)
        expect(result.point[1]).toBe(0.9)
        expect(result.guideX).toBe(0.4)
        expect(result.guideY).toBeNull()
    })

    it('does not reach past the tolerance', () => {
        const result = snapToGuides([0.5, 0.5], [[0.4, 0.4]], 0.01)
        expect(result.point).toEqual([0.5, 0.5])
        expect(result.guideX).toBeNull()
    })

    it('takes the nearest candidate when several are in range', () => {
        const result = snapToGuides([0.5, 0.5], [[0.49, 0], [0.505, 0]], 0.02)
        expect(result.guideX).toBe(0.505)
    })

    it('offers the frame and every other surface, never the dragged one', () => {
        const surfaces = [
            { id: 'a', corners: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]] },
            { id: 'b', corners: [[0.7, 0.7], [0.8, 0.7], [0.8, 0.8], [0.7, 0.8]] }
        ]
        const points = guideCandidates(surfaces, 'a')
        expect(points).toContainEqual([0.7, 0.7])
        expect(points).not.toContainEqual([0.1, 0.1])
        expect(points).toContainEqual([0.5, 0.5])
    })
})
