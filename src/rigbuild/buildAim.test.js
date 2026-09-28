import { describe, expect, it } from 'vitest'
import { REACH_M, castAim, pieceBox, placement, snapWords, stepHeight, turn } from './buildAim.js'
import { TRUSS_SECTION_M } from './pieces.js'

const truss = { id: 't1', kind: 'truss-3m', position: [0, 6, 0], yaw: 0, height: null }
const tower = { id: 'w1', kind: 'tower', position: [5, 0, 0], yaw: 0, height: 6 }
const deck = { id: 'd1', kind: 'deck-2x1', position: [0, 0, 10], yaw: 0, height: 1.2 }
const pieces = [truss, tower, deck]

const eye = [0, 1.6, -8]
const toward = (p) => [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]

describe('castAim — the ray against the rig', () => {
    it('hits the floor where the ray meets y = 0', () => {
        const hit = castAim({ origin: [0, 1.6, 0], direction: [0, -1.6, 4] })
        expect(hit.what).toBe('floor')
        expect(hit.point[0]).toBeCloseTo(0)
        expect(hit.point[2]).toBeCloseTo(4)
    })

    it('hits a truss before the floor behind it, with the face it entered', () => {
        const hit = castAim({ origin: eye, direction: toward([0.4, 6, 0]), pieces })
        expect(hit.what).toBe('piece')
        expect(hit.id).toBe('t1')
        expect(hit.normal).toEqual([0, 0, -1])
    })

    it('turns a piece box with its yaw', () => {
        const turned = { ...truss, yaw: Math.PI / 2 }
        // A 3 m truss turned a quarter runs along z: a point 1.2 m along z is on it, 1.2 m along x is not.
        expect(castAim({ origin: [0, 10, 1.2], direction: [0, -1, 0], pieces: [turned] })?.what).toBe('piece')
        expect(castAim({ origin: [1.2, 10, 0], direction: [0, -1, 0], pieces: [turned] })?.what).toBe('floor')
    })

    it('hits a lamp as a small sphere at its lens', () => {
        const hit = castAim({ origin: [0, 1.6, 0], direction: [0, 0, 1], lamps: [{ id: 'l1', lens: [0, 1.6, 5] }] })
        expect(hit.what).toBe('lamp')
        expect(hit.distance).toBeCloseTo(5 - 0.35)
    })

    it('does not reach past the reach limit', () => {
        expect(castAim({ origin: [0, 1.6, 0], direction: [0, -0.01, 1] })).toBeNull()
        expect(REACH_M).toBe(40)
    })

    it('knows each piece by the catalogue box (a tower by its base plate)', () => {
        expect(pieceBox('truss-2m')).toEqual([[-1, -TRUSS_SECTION_M / 2, -TRUSS_SECTION_M / 2], [1, TRUSS_SECTION_M / 2, TRUSS_SECTION_M / 2]])
        expect(pieceBox('tower', 7)[1][1]).toBe(7)
        expect(pieceBox('deck-2x1', 1.2)[1]).toEqual([1, 1.2, 0.5])
    })
})

describe('placement — the hand on something, the piece where snap() puts it', () => {
    const floorHit = (x, z) => ({ what: 'floor', point: [x, 0, z], normal: [0, 1, 0] })
    const pieceHit = (p, point) => ({ what: 'piece', id: p.id, kind: p.kind, point, normal: [0, 0, -1] })

    it('a lamp on a truss hangs at the nearest slot', () => {
        const res = placement({ slot: { kind: 'lamp' }, hit: pieceHit(truss, [0.6, 6.1, -0.145]), pieces })
        expect(res.ok).toBe(true)
        expect(res.hung).toBe(true)
        expect(res.to.join).toBe('hang')
        expect(res.position).toEqual([0.75, 6 - TRUSS_SECTION_M / 2, 0])
        expect(snapWords(res, pieces)).toBe('snap: truss slot 5')
    })

    it('a lamp on the floor stands on the 0.5 m grid; on a deck, on its top', () => {
        const floor = placement({ slot: { kind: 'lamp' }, hit: floorHit(3.26, 2.74), pieces })
        expect(floor.position).toEqual([3.5, 0, 2.5])
        expect(floor.hung).toBe(false)
        const top = placement({ slot: { kind: 'lamp' }, hit: pieceHit(deck, [0.4, 1.2, 10.1]), pieces })
        expect(top.to.join).toBe('stand')
        expect(top.position).toEqual([0.5, 1.2, 10])
    })

    it('refuses what cannot be built, in words', () => {
        expect(placement({ slot: { kind: 'lamp', effect: true }, hit: pieceHit(truss, [0, 6, 0]), pieces }).ok).toBe(false)
        expect(placement({ slot: { kind: 'lamp' }, hit: pieceHit(tower, [5, 3, 0]), pieces }).reason).toMatch(/tower/)
        expect(placement({ slot: { kind: 'lamp' }, hit: { what: 'lamp', id: 'x', point: [0, 0, 0] }, pieces }).ok).toBe(false)
        expect(placement({ slot: { kind: 'deck-2x1' }, hit: pieceHit(truss, [0, 6, 0]), pieces }).ok).toBe(false)
        expect(placement({ slot: { kind: 'lamp' }, hit: null, pieces }).ok).toBe(false)
    })

    it('a truss aimed at a truss continues it from the nearer end', () => {
        const res = placement({ slot: { kind: 'truss-2m' }, hit: pieceHit(truss, [1.3, 6, -0.145]), pieces })
        expect(res.to).toMatchObject({ id: 't1', join: 'face' })
        // Its end A meets the 3 m truss's end B at x = 1.5, so its centre is at 2.5.
        expect(res.position).toEqual([2.5, 6, 0])
    })

    it('a truss aimed at a tower sits on its top — the stacking join', () => {
        const res = placement({ slot: { kind: 'truss-3m' }, hit: pieceHit(tower, [5, 5.5, -0.4]), yaw: 0, pieces })
        expect(res.to).toMatchObject({ id: 'w1', join: 'sit' })
        expect(res.position).toEqual([6.5, 6 + TRUSS_SECTION_M / 2, 0])
    })

    it('a truss aimed at the floor hangs at the height Q/E set, on the grid', () => {
        const res = placement({ slot: { kind: 'truss-1m' }, hit: floorHit(-4.2, 3.1), height: 7.5, pieces })
        expect(res.position).toEqual([-4, 7.5, 3])
        expect(res.to.grid).toBe(0.5)
    })

    it('a tower aimed under a truss end stands on the floor and is built up to it', () => {
        const res = placement({ slot: { kind: 'tower' }, hit: pieceHit(truss, [-1.4, 6, 0]), height: 6, pieces })
        expect(res.to.join).toBe('under')
        expect(res.position).toEqual([-1.5, 0, 0])
        expect(res.height).toBeCloseTo(6 - TRUSS_SECTION_M / 2)
    })

    it('a deck aimed at a deck joins its nearest edge, at its height', () => {
        const res = placement({ slot: { kind: 'deck-2x1' }, hit: pieceHit(deck, [0.95, 1.1, 10]), pieces })
        expect(res.to.join).toBe('face')
        expect(res.height).toBe(1.2)
        // Side by side along x: the new deck's centre is one deck-width over.
        expect(res.position[0]).toBeCloseTo(2)
        expect(res.position[2]).toBeCloseTo(10)
    })
})

describe('the hand’s own keys', () => {
    it('Q/E step a truss by 0.5 m and a deck by 0.2 m, within bounds', () => {
        expect(stepHeight('truss', 6, 1)).toBe(6.5)
        expect(stepHeight('truss', 1, -1)).toBe(1)
        expect(stepHeight('deck', 1, 1)).toBe(1.2)
        expect(stepHeight('deck', 2, 1)).toBe(2)
    })

    it('R turns a quarter; the fine step is 15°', () => {
        expect(turn(0)).toBeCloseTo(Math.PI / 2)
        expect(turn(0, { fine: true })).toBeCloseTo(Math.PI / 12)
        expect(turn(Math.PI, {})).toBeCloseTo(-Math.PI / 2)
    })
})
