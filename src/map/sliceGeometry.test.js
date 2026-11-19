import { describe, expect, it } from 'vitest'
import {
    colourTransfer, evaluateWarp, frameOf, inputCorners, inputFrameOf, inputFromFrame, isWarpActive, moveCorners,
    regularGrid, resampleWarp, rotateCorners, scaleCorners, setBoxField, setFrameField, softEdgeCurve, softEdgeMask,
    tessellate, toLocal, toWall, warpGridSize, warpPoints
} from './sliceGeometry.js'

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const near = (a, b, digits = 6) => expect(a).toBeCloseTo(b, digits)
const nearPoint = (a, b, digits = 6) => { near(a[0], b[0], digits); near(a[1], b[1], digits) }
const side = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
const dot = (o, a, b) => ((a[0] - o[0]) * (b[0] - o[0])) + ((a[1] - o[1]) * (b[1] - o[1]))

describe('frameOf', () => {
    it('reads an axis-aligned rectangle exactly', () => {
        const frame = frameOf(rect(100, 40, 200, 80))
        expect(frame).toEqual({ x: 200, y: 80, width: 200, height: 80, rotation: 0, left: 100, top: 40 })
    })

    it('reads a 30 degree rotated rectangle', () => {
        const corners = rotateCorners(rect(100, 100, 200, 80), 30, [200, 140])
        const frame = frameOf(corners)
        near(frame.rotation, 30, 4)
        near(frame.width, 200, 4)
        near(frame.height, 80, 4)
        near(frame.x, 200, 4)
        near(frame.y, 140, 4)
    })
})

describe('setFrameField', () => {
    const base = rect(100, 100, 200, 80)

    it('x, y, left and top move the slice and nothing else', () => {
        for (const [field, value] of [['x', 500], ['y', 300], ['left', 40], ['top', 7]]) {
            const frame = frameOf(setFrameField(base, field, value))
            near(frame[field], value, 6)
            near(frame.width, 200, 6)
            near(frame.height, 80, 6)
            near(frame.rotation, 0, 6)
        }
        // x moves only x: y stays put.
        near(frameOf(setFrameField(base, 'x', 500)).y, 140)
        near(frameOf(setFrameField(base, 'y', 300)).x, 200)
    })

    it('width and height scale along the slice’s own axes', () => {
        const rotated = rotateCorners(base, 30, [200, 140])
        const wider = setFrameField(rotated, 'width', 300)
        const frame = frameOf(wider)
        near(frame.width, 300, 4)
        near(frame.height, 80, 4)
        near(frame.rotation, 30, 4)
        // Still a rectangle: adjacent sides stay at right angles.
        near(dot(wider[0], wider[1], wider[3]), 0, 3)
        near(dot(wider[2], wider[1], wider[3]), 0, 3)
        near(side(wider[0], wider[1]), side(wider[3], wider[2]), 4)
        const taller = frameOf(setFrameField(rotated, 'height', 160))
        near(taller.height, 160, 4)
        near(taller.width, 200, 4)
    })

    // Emily, 11-12: typing a height moved Y (404→410 took Y 223→220).
    it('width and height keep the left and top edges where they are', () => {
        const taller = frameOf(setFrameField(base, 'height', 410))
        near(taller.height, 410, 6)
        near(taller.top, 100, 6)
        near(taller.left, 100, 6)
        const wider = frameOf(setFrameField(base, 'width', 217))
        near(wider.width, 217, 6)
        near(wider.left, 100, 6)
        near(wider.top, 100, 6)
        // turned: its own first corner stays put
        const rotated = rotateCorners(base, 30, [200, 140])
        nearPoint(setFrameField(rotated, 'height', 160)[0], rotated[0], 6)
        nearPoint(setFrameField(rotated, 'width', 300)[0], rotated[0], 6)
    })

    it('a bent or keystoned slice (straight box) keeps its box’s left and top too', () => {
        const keystoned = [[100, 100], [300, 110], [290, 180], [110, 190]]
        const xs = keystoned.map(([x]) => x), ys = keystoned.map(([, y]) => y)
        const box = { x: 200, y: 145, width: 200, height: 90, rotation: 0, left: Math.min(...xs), top: Math.min(...ys), boxed: true }
        const taller = setBoxField(keystoned, box, 'height', 180)
        near(Math.min(...taller.map(([, y]) => y)), box.top, 6)
        near(Math.max(...taller.map(([, y]) => y)) - Math.min(...taller.map(([, y]) => y)), 180, 6)
        near(Math.min(...taller.map(([x]) => x)), box.left, 6)
        const wider = setBoxField(keystoned, box, 'width', 400)
        near(Math.min(...wider.map(([x]) => x)), box.left, 6)
        near(Math.max(...wider.map(([x]) => x)) - Math.min(...wider.map(([x]) => x)), 400, 6)
    })

    it('rotation round-trips through frameOf', () => {
        const turned = setFrameField(base, 'rotation', 45)
        near(frameOf(turned).rotation, 45, 4)
        near(frameOf(turned).width, 200, 4)
        near(frameOf(setFrameField(turned, 'rotation', -20)).rotation, -20, 4)
    })

    it('leaves corners alone for an unknown field', () => {
        expect(setFrameField(base, 'nonsense', 1)).toBe(base)
    })
})

describe('scaleCorners', () => {
    it('scales about the pivot', () => {
        const scaled = scaleCorners(rect(0, 0, 100, 100), 2, 0.5, [0, 0])
        scaled.forEach((corner, index) => nearPoint(corner, [[0, 0], [200, 0], [200, 50], [0, 50]][index]))
    })

    it('keeps the pivot fixed', () => {
        const scaled = scaleCorners(rect(0, 0, 100, 100), 3, 3, [50, 50])
        nearPoint(scaled[0], [-100, -100])
        nearPoint(scaled[2], [200, 200])
    })
})

describe('evaluateWarp', () => {
    const regular = (mode, divisionsX = 2, divisionsY = 2) => ({ mode, divisionsX, divisionsY, points: regularGrid(divisionsX, divisionsY) })

    it('returns (u, v) unchanged on a regular grid (linear)', () => {
        const warp = regular('linear')
        for (const [u, v] of [[0, 0], [0.13, 0.77], [0.5, 0.5], [1, 1], [0.9, 0.2]]) nearPoint(evaluateWarp(warp, u, v), [u, v])
    })

    it('returns (u, v) unchanged at the grid nodes (bezier)', () => {
        const warp = regular('bezier')
        for (let i = 0; i <= 4; i += 1) for (let j = 0; j <= 4; j += 1) nearPoint(evaluateWarp(warp, i / 4, j / 4), [i / 4, j / 4])
    })

    // Regression guard (2026-10-25): clamped edge neighbours (p0 = p1) bent the first and last
    // cell of an UNMOVED grid (u 0.13 came back as 0.115). The grid is now continued linearly
    // past its edge, so an untouched bezier warp is the identity everywhere.
    it('returns (u, v) unchanged between nodes on a regular grid (bezier)', () => {
        const warp = regular('bezier')
        for (const [u, v] of [[0.13, 0.77], [0.3, 0.3], [0.9, 0.2], [0.05, 0.6]]) nearPoint(evaluateWarp(warp, u, v), [u, v])
    })

    it('honours a moved interior point (linear: exactly that point at its node)', () => {
        const warp = regular('linear', 1, 1)
        warp.points[4] = [0.6, 0.35]
        nearPoint(evaluateWarp(warp, 0.5, 0.5), [0.6, 0.35])
        // The corners still sit where they were.
        nearPoint(evaluateWarp(warp, 0, 0), [0, 0])
        nearPoint(evaluateWarp(warp, 1, 1), [1, 1])
    })

    it('honours a moved interior point (bezier passes through it)', () => {
        const warp = regular('bezier', 1, 1)
        warp.points[4] = [0.6, 0.35]
        nearPoint(evaluateWarp(warp, 0.5, 0.5), [0.6, 0.35])
    })

    it('perspective ignores points', () => {
        const warp = regular('perspective', 1, 1)
        warp.points[4] = [0.9, 0.1]
        nearPoint(evaluateWarp(warp, 0.5, 0.5), [0.5, 0.5])
        nearPoint(evaluateWarp(warp, 0.2, 0.8), [0.2, 0.8])
    })

    it('is the identity with no warp at all', () => {
        expect(evaluateWarp(null, 0.3, 0.4)).toEqual([0.3, 0.4])
    })
})

describe('isWarpActive', () => {
    it('is false for no warp, a regular grid and perspective', () => {
        expect(isWarpActive(null)).toBe(false)
        expect(isWarpActive({ mode: 'linear', divisionsX: 1, divisionsY: 1, points: regularGrid(1, 1) })).toBe(false)
        const moved = { mode: 'perspective', divisionsX: 1, divisionsY: 1, points: regularGrid(1, 1) }
        moved.points[4] = [0.7, 0.7]
        expect(isWarpActive(moved)).toBe(false)
    })

    it('is true once a point has moved', () => {
        const warp = { mode: 'linear', divisionsX: 1, divisionsY: 1, points: regularGrid(1, 1) }
        warp.points[4] = [0.6, 0.5]
        expect(isWarpActive(warp)).toBe(true)
        warp.mode = 'bezier'
        expect(isWarpActive(warp)).toBe(true)
    })
})

describe('warp grid', () => {
    it('is (2^d + 1) points each way', () => {
        expect(warpGridSize({ divisionsX: 0, divisionsY: 0 })).toEqual({ columns: 2, rows: 2 })
        expect(warpGridSize({ divisionsX: 2, divisionsY: 1 })).toEqual({ columns: 5, rows: 3 })
        expect(warpPoints({ divisionsX: 1, divisionsY: 1, points: [[0, 0]] }).points).toHaveLength(9)
    })

    it('resampleWarp from 0,0 to 2,1 gives 15 points on the identity', () => {
        const next = resampleWarp({ mode: 'linear', divisionsX: 0, divisionsY: 0, points: regularGrid(0, 0) }, 2, 1)
        expect(next.points).toHaveLength(15)
        expect(next.divisionsX).toBe(2)
        expect(next.divisionsY).toBe(1)
        next.points.forEach((point, index) => {
            const column = index % 5
            const row = Math.floor(index / 5)
            nearPoint(point, [column / 4, row / 2])
        })
    })

    it('resampleWarp keeps a bend', () => {
        const bent = { mode: 'linear', divisionsX: 1, divisionsY: 1, points: regularGrid(1, 1) }
        bent.points[4] = [0.6, 0.5]
        const finer = resampleWarp(bent, 2, 2)
        expect(finer.points).toHaveLength(25)
        nearPoint(finer.points[12], [0.6, 0.5])
    })
})

describe('pin', () => {
    const corners = [[100, 50], [420, 80], [400, 300], [90, 280]]

    it('toWall and toLocal round-trip', () => {
        for (const local of [[0, 0], [1, 1], [0.25, 0.8], [0.5, 0.5]]) {
            nearPoint(toLocal(corners, toWall(corners, local)), local, 5)
        }
    })

    it('toWall puts the unit corners on the slice corners', () => {
        nearPoint(toWall(corners, [0, 0]), corners[0], 4)
        nearPoint(toWall(corners, [1, 1]), corners[2], 4)
    })

    it('tessellate makes a (steps + 1)² lattice', () => {
        const mesh = tessellate(corners, null, 8)
        expect(mesh.steps).toBe(8)
        expect(mesh.lattice).toHaveLength(81)
        expect(tessellate(corners, null).lattice).toHaveLength(33 * 33)
        nearPoint(mesh.lattice[0].point, corners[0], 4)
    })
})

describe('input frames', () => {
    it('inputCorners and frameOf round-trip with rotation', () => {
        const input = [0.1, 0.2, 0.3, 0.4]
        const corners = inputCorners(input, 25, 3200, 1440)
        const frame = frameOf(corners)
        near(frame.rotation, 25, 4)
        near(frame.width, 0.3 * 3200, 3)
        near(frame.height, 0.4 * 1440, 3)
        const centre = inputFrameOf(input, 25, 3200, 1440)
        near(frame.x, centre.x, 3)
        near(frame.y, centre.y, 3)
        inputFromFrame(frame, 3200, 1440).forEach((value, index) => near(value, input[index], 5))
    })
})

describe('moveCorners', () => {
    it('shifts every corner', () => {
        expect(moveCorners(rect(0, 0, 10, 10), 5, -5)[2]).toEqual([15, 5])
    })
})

describe('softEdgeCurve', () => {
    it('is 0 at 0, 1 at 1 and the luminance in the middle (gamma 1)', () => {
        expect(softEdgeCurve(0)).toBe(0)
        expect(softEdgeCurve(1)).toBe(1)
        near(softEdgeCurve(0.5, { luminance: 0.5, gamma: 1 }), 0.5)
        near(softEdgeCurve(0.5, { luminance: 0.3, gamma: 1 }), 0.3)
    })

    it('rises monotonically', () => {
        for (const options of [{}, { power: 3, luminance: 0.4 }, { power: 1, gamma: 2.2 }]) {
            let last = -1
            for (let step = 0; step <= 40; step += 1) {
                const value = softEdgeCurve(step / 40, options)
                expect(value).toBeGreaterThanOrEqual(last - 1e-9)
                last = value
            }
        }
    })
})

describe('softEdgeMask', () => {
    it('is null when disabled or with no widths', () => {
        expect(softEdgeMask(null)).toBeNull()
        expect(softEdgeMask({ enabled: false, left: 0.2 })).toBeNull()
        expect(softEdgeMask({ enabled: true, left: 0, right: 0, top: 0, bottom: 0 })).toBeNull()
    })

    it('is two linear gradients otherwise', () => {
        const mask = softEdgeMask({ enabled: true, left: 0.2, right: 0, top: 0, bottom: 0.1 })
        expect(typeof mask).toBe('string')
        expect(mask.match(/linear-gradient\(/g)).toHaveLength(2)
        expect(mask).toContain('to right')
        expect(mask).toContain('to bottom')
    })
})

describe('colourTransfer', () => {
    it('is null at the defaults', () => {
        expect(colourTransfer()).toBeNull()
        expect(colourTransfer({ brightness: 1, contrast: 1, red: 0, green: 0, blue: 0 })).toBeNull()
    })

    it('red 0.5 gives r.slope 1.5 and leaves green and blue', () => {
        const transfer = colourTransfer({ red: 0.5 })
        expect(transfer.r.slope).toBe(1.5)
        expect(transfer.g.slope).toBe(1)
        expect(transfer.b.slope).toBe(1)
    })
})
