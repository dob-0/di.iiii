import { describe, expect, it } from 'vitest'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { piecesOf, trussRuns } from './plotGeometry.js'
import { plotData } from './sheet.js'
import { snap } from './snap.js'
import {
    REAL_LIGHT_BUDGET, createOps, deleteOps, heightOps, lampEntity, moveOps, pieceEntity, placeOps,
    renamePositionOps, ridersOfIds, rotateOps, runLengthOps
} from './plotEdits.js'

const bsw = typeById(TYPE_LIBRARY, 'up-250bsw')
const smoke = typeById(TYPE_LIBRARY, 'up-yz31p')
const apply = (doc, ops) => applyProjectOps(doc, ops)
const empty = () => normalizeProjectDocument({ entities: [] })

// A 6 m truss (two 3 m) at 6 m on two towers, and a lamp hung at a slot.
const rig = () => {
    let doc = empty()
    doc = apply(doc, createOps([
        pieceEntity({ id: 'tl', kind: 'tower', position: [-3, 0, 0], height: 5.855 }),
        pieceEntity({ id: 'tr', kind: 'tower', position: [3, 0, 0], height: 5.855 }),
        pieceEntity({ id: 's1', kind: 'truss-3m', position: [-1.5, 6, 0], name: 'header' }),
        pieceEntity({ id: 's2', kind: 'truss-3m', position: [1.5, 6, 0], name: 'header' })
    ]))
    const pieces = piecesOf(doc.entities).map((p) => ({ id: p.id, kind: p.kind, position: p.position, yaw: p.yaw, height: p.height }))
    const hang = snap({ kind: 'lamp', position: [-0.3, 0, 0.1], others: pieces, metric: 'plan' })
    doc = apply(doc, createOps([lampEntity({ id: 'l1', type: bsw, mount: hang.position, hung: hang.hung, position: 'header', unit: 1, entities: doc.entities })]))
    return doc
}

describe('what the plot creates', () => {
    it('a piece keeps its kind and carries a non-catalogue height in scale.y', () => {
        const doc = rig()
        const tower = doc.entities.find((e) => e.id === 'tl')
        expect(tower.components.piece).toEqual({ kind: 'tower' })
        expect(piecesOf([tower])[0].height).toBeCloseTo(5.855)
    })

    it('a lamp hung from a truss slot: typed, positioned, its mount on the slot', () => {
        const doc = rig()
        const lamp = doc.entities.find((e) => e.id === 'l1')
        expect(lamp.type).toBe('spotLight')
        expect(lamp.components.fixture).toMatchObject({ type: 'up-250bsw', mode: '24ch', position: 'header', unit: 1, hung: true })
        const [l] = plotData({ entities: doc.entities, library: TYPE_LIBRARY }).lamps
        expect(l.mount[0]).toBeCloseTo(-0.25)
        expect(l.mount[1]).toBeCloseTo(6 - 0.145)
    })

    it('a lamp past the real-light budget draws its beam and casts no light', () => {
        const many = Array.from({ length: REAL_LIGHT_BUDGET }, (_, i) => ({ id: `r${i}`, type: 'spotLight', components: {} }))
        expect(lampEntity({ id: 'n', type: bsw, mount: [0, 0, 0], entities: many }).components.beam.only).toBe(true)
        expect(lampEntity({ id: 'n', type: bsw, mount: [0, 0, 0], entities: [] }).components.beam.only).toBeUndefined()
    })

    it('an effect is a DMX device with no beam', () => {
        const e = lampEntity({ id: 'fx', type: smoke, mount: [0, 0, 0] })
        expect(e.type).toBe('group')
        expect(e.components.fixture.type).toBe('up-yz31p')
    })
})

describe('what the plot changes', () => {
    it('knows the lamp rides the truss, and moving the truss with its riders keeps it on its slot', () => {
        let doc = rig()
        const riders = ridersOfIds(doc.entities, ['s1', 's2'], TYPE_LIBRARY)
        expect(riders).toEqual(['l1'])
        doc = apply(doc, moveOps(doc.entities, ['s1', 's2', ...riders], [0, 0, 2]))
        const again = ridersOfIds(doc.entities, ['s1', 's2'], TYPE_LIBRARY)
        expect(again).toEqual(['l1'])
    })

    it('raising a truss raises its lamps; building a tower higher changes only its scale', () => {
        let doc = rig()
        doc = apply(doc, heightOps(doc.entities, 's1', 7, TYPE_LIBRARY))
        expect(doc.entities.find((e) => e.id === 's1').components.transform.position[1]).toBe(7)
        const [l] = plotData({ entities: doc.entities, library: TYPE_LIBRARY }).lamps
        expect(l.mount[1]).toBeCloseTo(7 - 0.145)
        doc = apply(doc, heightOps(doc.entities, 'tl', 6.855, TYPE_LIBRARY))
        const tower = doc.entities.find((e) => e.id === 'tl')
        expect(tower.components.transform.position).toEqual([-3, 0, 0])
        expect(piecesOf([tower])[0].height).toBeCloseTo(6.855)
    })

    it('turns a piece about a centre, heading and all', () => {
        let doc = rig()
        doc = apply(doc, rotateOps(doc.entities, ['s2'], Math.PI / 2, [0, 0]))
        const s2 = doc.entities.find((e) => e.id === 's2')
        expect(s2.components.transform.position[0]).toBeCloseTo(0)
        expect(s2.components.transform.position[2]).toBeCloseTo(-1.5)
        expect(s2.components.transform.rotation[1]).toBeCloseTo(Math.PI / 2)
    })

    it('places one piece at a snapped pose with a new height', () => {
        let doc = rig()
        const tl = doc.entities.find((e) => e.id === 'tl')
        doc = apply(doc, placeOps(tl, { position: [-4, 0, 1], yaw: 0, height: 6 }))
        const t = doc.entities.find((e) => e.id === 'tl').components.transform
        expect(t.position).toEqual([-4, 0, 1])
        expect(t.scale[1]).toBe(1)
    })

    it('re-lays a run at a typed length, keeping its name and height', () => {
        let doc = rig()
        const [run] = trussRuns(piecesOf(doc.entities))
        expect(run.length).toBe(6)
        let n = 0
        doc = apply(doc, runLengthOps({ entities: doc.entities, run, length: 8, newId: () => `n${++n}`, assetFor: () => 'a' }))
        const [next] = trussRuns(piecesOf(doc.entities))
        expect(next.length).toBe(8)
        expect(next.height).toBe(6)
        expect(next.from).toEqual(run.from)
        expect(next.name).toBe('header')
    })

    it('renames a position on the truss and on every lamp that names it', () => {
        let doc = rig()
        doc = apply(doc, renamePositionOps(doc.entities, { pieceIds: ['s1', 's2'], from: 'header', to: 'upstage truss' }))
        expect(doc.entities.find((e) => e.id === 's1').name).toBe('upstage truss')
        expect(doc.entities.find((e) => e.id === 'l1').components.fixture.position).toBe('upstage truss')
    })

    it('deletes', () => {
        const doc = apply(rig(), deleteOps(['l1']))
        expect(doc.entities.some((e) => e.id === 'l1')).toBe(false)
    })
})
