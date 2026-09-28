import { describe, expect, it } from 'vitest'
import { PIECES, TRUSS_SECTION_M, pieceComponents, pieceKindOf } from './pieces.js'
import { rotateY, snap, snapPoseOf, wrapYaw } from './snap.js'
import { lensFromMount, mountFromLens } from './lampGeometry.js'

const close = (a, b, eps = 1e-6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))

describe('the pieces', () => {
    it('are the three truss lengths, a tower and a 2 x 1 deck, with slots every 0.5 m', () => {
        expect(Object.keys(PIECES)).toEqual(['truss-1m', 'truss-2m', 'truss-3m', 'tower', 'deck-2x1'])
        const slots = (kind) => PIECES[kind].points.filter((p) => p.kind === 'slot').map((p) => p.pos[0])
        expect(slots('truss-1m')).toEqual([-0.25, 0.25])
        expect(slots('truss-2m')).toEqual([-0.75, -0.25, 0.25, 0.75])
        expect(slots('truss-3m')).toHaveLength(6)
        expect(PIECES['truss-2m'].size).toEqual([2, 0.29, 0.29])
    })

    it('become entity components, and an entity says which piece it is', () => {
        const c = pieceComponents('deck-2x1', { position: [1, 0, 2], yaw: Math.PI / 2 })
        expect(c.piece).toEqual({ kind: 'deck-2x1' })
        expect(pieceKindOf({ components: c })).toBe('deck-2x1')
        expect(pieceKindOf({ components: { piece: { kind: 'nope' } } })).toBe(null)
        expect(() => pieceComponents('nope')).toThrow(/no piece/)
    })
})

describe('snap — truss to truss', () => {
    const a = { id: 'a', kind: 'truss-2m', position: [0, 6, 0], yaw: 0 }

    it('continues the line when an end is let go near another end', () => {
        const out = snap({ id: 'b', kind: 'truss-2m', position: [2.2, 6.05, 0.1], yaw: 0, others: [a] })
        close(out.position, [2, 6, 0])
        expect(out.yaw).toBe(0)
        expect(out.to).toEqual({ id: 'a', point: 'end-b', join: 'face' })
    })

    it('turns a truss held the wrong way round so its near end meets', () => {
        // Held at yaw pi: its end-b now points -X, and is the one near a's end-b.
        const out = snap({ id: 'b', kind: 'truss-3m', position: [2.6, 6, 0], yaw: Math.PI, others: [a] })
        close(out.position, [2.5, 6, 0])
        expect(Math.abs(out.yaw)).toBeCloseTo(Math.PI, 6)
    })

    it('works on a truss that is itself turned', () => {
        const turned = { id: 'a', kind: 'truss-2m', position: [0, 6, 0], yaw: Math.PI / 2 }
        // a's end-b is at rotateY([1,0,0], pi/2) = [0, 0, -1]
        close(rotateY([1, 0, 0], Math.PI / 2), [0, 0, -1])
        // b held nearly along the same line (yaw 1.4), its end-a near a's end-b.
        const out = snap({ id: 'b', kind: 'truss-2m', position: [0.05, 6, -2.05], yaw: 1.4, others: [turned] })
        close(out.position, [0, 6, -2])
        expect(out.yaw).toBeCloseTo(Math.PI / 2, 6)
    })

    it('lets go on the grid when nothing is near, keeping the truss height', () => {
        const out = snap({ id: 'b', kind: 'truss-2m', position: [5.3, 4.2, 1.26], yaw: 0.2, others: [a] })
        expect(out.position).toEqual([5.5, 4.2, 1.5])
        expect(out.to).toEqual({ grid: 0.5 })
    })

    it('never joins a piece to itself', () => {
        const out = snap({ id: 'a', kind: 'truss-2m', position: [0.05, 6, 0], yaw: 0, others: [a] })
        expect(out.to).toEqual({ grid: 0.5 })
    })
})

describe('snap — truss and tower', () => {
    const tower = { id: 't', kind: 'tower', position: [4, 0, 0], yaw: 0 }

    it('sits a truss end on a tower top, the centre line half a section up', () => {
        const out = snap({ id: 'b', kind: 'truss-2m', position: [5.1, 6.2, 0], yaw: 0, others: [tower] })
        close(out.position, [5, 6 + TRUSS_SECTION_M / 2, 0])
        expect(out.to.join).toBe('sit')
    })

    it('stands a tower under a truss end when its top is let go near the end', () => {
        const truss = { id: 'h', kind: 'truss-2m', position: [0, 6.2, 0], yaw: 0 }
        const out = snap({ id: 't2', kind: 'tower', position: [1.1, 0.1, 0.1], yaw: 0, others: [truss] })
        // Top held at (1.1, 6.1, 0.1); the end is at (1, 6.2, 0): the tower drops
        // under it, its top half a section below the centre line.
        close(out.position, [1, 6.2 - TRUSS_SECTION_M / 2 - 6, 0])
        expect(out.to).toEqual({ id: 'h', point: 'end-b', join: 'under' })
        // Held low, its top nowhere near: the floor grid.
        expect(snap({ id: 't2', kind: 'tower', position: [1.1, -1, 0.1], others: [truss] }).to).toEqual({ grid: 0.5 })
    })
})

describe('snap — decks', () => {
    const deck = { id: 'd', kind: 'deck-2x1', position: [0, 0, 0], yaw: 0 }

    it('puts decks side by side, tops level', () => {
        close(snap({ id: 'e', kind: 'deck-2x1', position: [2.15, 0, 0.05], others: [deck] }).position, [2, 0, 0])
        close(snap({ id: 'e', kind: 'deck-2x1', position: [0.1, 0, 1.1], others: [deck] }).position, [0, 0, 1])
    })

    it('stands a lone deck on the floor grid', () => {
        expect(snap({ id: 'e', kind: 'deck-2x1', position: [7.3, 0.4, 2.26], others: [deck] }).position).toEqual([7.5, 0, 2.5])
    })
})

describe('snap — lamps', () => {
    const truss = { id: 'h', kind: 'truss-2m', position: [0, 6, 0], yaw: 0 }
    const deck = { id: 'd', kind: 'deck-2x1', position: [10, 0, 0], yaw: 0 }

    it('hangs a lamp from the nearest truss slot', () => {
        const out = snap({ id: 'l', kind: 'lamp', position: [0.3, 5.8, 0.05], others: [truss] })
        close(out.position, [0.25, 6 - TRUSS_SECTION_M / 2, 0])
        expect(out.hung).toBe(true)
        expect(out.to).toEqual({ id: 'h', point: 'slot-3', join: 'hang' })
    })

    it('stands a lamp on a deck, on the grid, inside the deck', () => {
        const out = snap({ id: 'l', kind: 'lamp', position: [10.7, 1.1, 0.4], others: [deck] })
        close(out.position, [10.5, 1, 0.5])
        expect(out.hung).toBe(false)
        expect(out.to.join).toBe('stand')
    })

    it('stands a lamp on the floor grid when it is near nothing', () => {
        expect(snap({ id: 'l', kind: 'lamp', position: [3.3, 2, 3.8], others: [truss, deck] })).toEqual({ position: [3.5, 0, 4], yaw: 0, hung: false, to: { grid: 0.5 } })
    })

    it('refuses an unknown kind', () => {
        expect(() => snap({ kind: 'chair', position: [0, 0, 0] })).toThrow(/unknown kind/)
    })

    it('reads a pose off an entity', () => {
        expect(snapPoseOf({ id: 'x', components: { transform: { position: [1, 2, 3], rotation: [0, 0.5, 0] } } }, 'tower'))
            .toEqual({ id: 'x', kind: 'tower', position: [1, 2, 3], yaw: 0.5 })
        expect(wrapYaw(3 * Math.PI)).toBeCloseTo(Math.PI, 9)
    })
})

describe('lens <-> mount', () => {
    const head = { model3d: { tiltY: 0.37, lensY: 0.698 } }
    const smoke = { model3d: { tiltY: null, lensY: 0.1 } }

    it('a standing head at home: the lens is lensY above the base', () => {
        close(lensFromMount({ mount: [1, 0, 2], type: head }), [1, 0.698, 2])
    })

    it('a hung head aimed down: the lens is lensY below the clamp', () => {
        close(lensFromMount({ mount: [0, 6, 0], hung: true, beam: [0, -1, 0], type: head }), [0, 6 - 0.698, 0])
    })

    it('round-trips for any aim', () => {
        for (const beam of [[1, 0, 0], [0.3, -0.8, 0.5], [0, 1, 0]]) {
            for (const hung of [false, true]) {
                const mount = [2, 5, -1]
                close(mountFromLens({ lens: lensFromMount({ mount, hung, beam, type: head }), hung, beam, type: head }), mount)
            }
        }
        close(mountFromLens({ lens: [0, 0.1, 0], type: smoke }), [0, 0, 0])
    })
})
