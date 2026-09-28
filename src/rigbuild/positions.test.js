import { describe, expect, it } from 'vitest'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { pieceEntity } from './plotEdits.js'
import { layRun, piecesOf } from './plotGeometry.js'
import { plotData } from './sheet.js'
import { fillOf, positionsOf, stageFrameOf } from './positions.js'
import { dealOps, evenPick, pickSlots } from './deal.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'

// A small hall like MOXIR's: nave rows at x ±12, next rows at ±36, columns every 6 m;
// a 3 x 2 m riser on the axis facing +z; a 7 m goalpost over it; a press behind it.
const plan = {
    name: 'test hall',
    outline: [[-40, -60], [40, -60], [40, 60], [-40, 60]],
    columns: [-36, -12, 12, 36].flatMap((x) => [0, 6, 12, 18, 24, 30, 36, 42, 48, 54].map((z) => [x, z, 0.8, 0.5])),
    zones: [
        { id: 'stage', label: 'DJ place', rects: [[-3.8, 3.6, 3.8, 7.5]] },
        { id: 'dance', label: 'dance floor', rects: [[-10, 7.5, 10, 48]] }
    ],
    solids: [{ id: 'press', label: 'press', rect: [0.25, 0.2, 3.05, 3.2], top: 4.5 }, { id: 'line', label: 'machine line', rect: [3.05, -0.5, 8, 2.5], top: 1.9 }],
    openings: [{ id: 'door', label: 'door', from: [-3, 54.5], to: [3, 54.5] }]
}
const venue = { id: 'hall', type: 'model', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, venuePlan: plan } }
const decks = [-1, 0, 1].map((dx, i) => pieceEntity({ id: `deck-${i}`, kind: 'deck-2x1', position: [dx, 0, 5.2], yaw: Math.PI / 2, height: 1.2, name: 'DJ riser' }))
const towers = [-3.5, 3.5].map((x, i) => pieceEntity({ id: `tower-${i}`, kind: 'tower', position: [x, 0, 5.1], height: 6.855, name: 'goalpost tower' }))
const header = layRun({ from: [-3.5, 5.1], to: [3.5, 5.1], y: 7 }).map((s, i) => pieceEntity({ id: `hdr-${i}`, kind: s.kind, position: s.position, yaw: s.yaw, name: 'truss header' }))
const entities = [venue, ...decks, ...towers, ...header]
const byId = (list, id) => list.find((p) => p.id === id)

describe('positions — derived from the pieces, the zones and the venue plan', () => {
    const positions = positionsOf(entities)

    it('finds the riser: its axis, which way the audience is, its edges', () => {
        const s = stageFrameOf({ pieces: piecesOf(entities), plan })
        expect(s).toMatchObject({ axis: 0, into: 1, back: 4.2, front: 6.2, width: 3, deck: 1.2 })
    })

    it('names every position a crew would, from what is in the room', () => {
        expect(positions.map((p) => p.id)).toEqual(['truss:hdr-0', 'tower-ladders', 'tower-tops', 'stage-back', 'stage-flanks', 'pit', 'column-bases', 'column-faces', 'dance-columns', 'outer-columns', 'backdrop'])
        expect(positions[0].name).toBe('truss header')
    })

    it('hangs the header slots at the catalogue pitch under the bottom chord', () => {
        const h = positions[0]
        expect(h.slots).toHaveLength(14) // 7 m, a clamp every 0.5 m, set in 0.25 m
        expect(h.slots[0].pos).toEqual([-3.25, 6.855, 5.1])
        expect(h.slots.every((s) => s.hung)).toBe(true)
    })

    it('takes the nave columns along the stage and dance zones, in pairs from the stage, not the one by the door', () => {
        const bases = byId(positions, 'column-bases')
        expect(bases.slots).toHaveLength(16) // z 6 … 48, both sides; z 0 is outside the zones, z 54 at the door
        expect(bases.slots.find((s) => s.id === 'L1').pos).toEqual([-10.9, 0, 6])
        expect(bases.slots.find((s) => s.id === 'R1').pos).toEqual([10.9, 0, 6])
        expect(byId(positions, 'column-faces').slots).toHaveLength(32)
        expect(byId(positions, 'outer-columns').slots[0].pos[0]).toBeCloseTo(-35.15)
    })

    it('puts the backdrop line off the press and the machine line, and nothing past the nave', () => {
        const b = byId(positions, 'backdrop')
        expect(b.slots[0].pos).toEqual([0.5, 0, 3.55])
        expect(b.slots.find((s) => s.pos[0] === 5).pos[2]).toBe(2.85)
        expect(b.name).toBe('backdrop · press')
    })
})

describe('deal — n of a card onto a position, evenly, symmetric, snapped', () => {
    it('evenPick spreads and mirrors', () => {
        expect(evenPick(14, 6)).toEqual([0, 3, 5, 8, 10, 13])
        expect(evenPick(7, 4)).toEqual([0, 2, 4, 6])
        expect(evenPick(19, 6)).toEqual([0, 4, 7, 11, 14, 18])
        expect(evenPick(5, 3)).toEqual([0, 2, 4])
        expect(evenPick(3, 5)).toEqual([0, 1, 2])
        for (const [c, n] of [[14, 6], [16, 8], [9, 4], [20, 6]]) {
            const p = evenPick(c, n)
            expect(p.map((i) => c - 1 - i).sort((a, b) => a - b)).toEqual(p)
        }
    })

    const positions = positionsOf(entities)
    it('fills a row of columns from the stage, a pair at a time: 6 booms then 10 beams', () => {
        const bases = byId(positions, 'column-bases')
        const first = pickSlots(bases, new Set(), 6)
        expect(first.slots.map((s) => s.id).sort()).toEqual(['L1', 'L2', 'L3', 'R1', 'R2', 'R3'])
        const second = pickSlots(bases, new Set(first.slots.map((s) => s.id)), 10)
        expect(second.slots.map((s) => s.pos[2]).sort((a, b) => a - b)).toEqual([24, 24, 30, 30, 36, 36, 42, 42, 48, 48])
    })

    it('says what it could not deal, and when a count is odd', () => {
        const tops = byId(positions, 'tower-tops')
        expect(pickSlots(tops, new Set(), 3).note).toMatch(/2 free — 1 not dealt/)
        expect(pickSlots(byId(positions, 'column-bases'), new Set(), 5).note).toMatch(/odd count/)
    })

    it('makes typed lamps at the slots (mount = slot), named and numbered along the position, and the fill finds them', () => {
        let n = 0
        const type = typeById(TYPE_LIBRARY, 'up-250bsw')
        const header = positions[0]
        const { ops, ids } = dealOps({ entities, position: header, filled: new Set(), type, n: 6, newId: () => `lamp-${++n}` })
        expect(ids).toHaveLength(6)
        const doc = applyProjectOps(normalizeProjectDocument({ entities }), ops)
        const lamps = plotData({ entities: doc.entities, library: TYPE_LIBRARY }).lamps
        expect(lamps.map((l) => l.mount[0]).sort((a, b) => a - b)).toEqual([-3.25, -1.75, -0.75, 0.75, 1.75, 3.25])
        const f = doc.entities.find((e) => e.id === 'lamp-1').components.fixture
        expect(f).toMatchObject({ type: 'up-250bsw', position: 'truss header', unit: 1, hung: true })
        const fill = fillOf(positionsOf(doc.entities), lamps)
        expect([...fill.keys()].filter((k) => k.startsWith('truss:')).length).toBe(6)
    })
})
