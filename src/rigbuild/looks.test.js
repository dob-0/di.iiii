import { describe, expect, it } from 'vitest'
import { TYPE_LIBRARY } from './types/index.js'
import { typeById } from './fixtureTypes.js'
import { pieceEntity } from './plotEdits.js'
import { layRun } from './plotGeometry.js'
import { positionsOf } from './positions.js'
import { dealOps } from './deal.js'
import { deskLookId, deskLooks, lookIdOfDesk, lookPoses, posedEntities, restOps } from './looks.js'
import { spotAimDirection } from '../project/viewport/spotLightAim.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { groupKeys, rigLooksFrom } from '../../scripts/rigbuild/looks.mjs'

const plan = {
    outline: [[-40, -60], [40, -60], [40, 60], [-40, 60]],
    columns: [-12, 12].flatMap((x) => [6, 12, 18, 24].map((z) => [x, z, 0.8, 0.5])),
    zones: [{ id: 'stage', rects: [[-3.8, 3.6, 3.8, 7.5]] }, { id: 'dance', rects: [[-10, 7.5, 10, 30]] }],
    overhead: [{ id: 'runway-l', line: [[-11, -50], [-11, 50]], bottom: 6.5 }]
}
const base = [
    { id: 'hall', type: 'model', components: { venuePlan: plan } },
    ...[-1, 0, 1].map((dx, i) => pieceEntity({ id: `d${i}`, kind: 'deck-2x1', position: [dx, 0, 5.2], yaw: Math.PI / 2, height: 1.2 })),
    ...layRun({ from: [-3.5, 5.1], to: [3.5, 5.1], y: 7 }).map((s, i) => pieceEntity({ id: `h${i}`, kind: s.kind, position: s.position, yaw: s.yaw, name: 'truss header' }))
]
const rig = {
    rig: 'test', writtenAt: '2026-09-28',
    classes: { beam: { code: 'UP-B380F' }, spot: { code: 'UP-250BSW' } },
    groups: [{ id: 'beams-cols', class: 'beam', mount: 'column-bases' }, { id: 'spots', class: 'spot', mount: 'truss-header' }],
    looks: {
        up: { title: 'Up', aims: { 'beams-cols': { rule: 'vertical' }, spots: { rule: 'vertical' } }, colours: { 'beams-cols': '#ff0000' } },
        cross: { title: 'Cross', aims: { 'beams-cols': { rule: 'cross', x: 8, y: 9 } } }
    }
}

const dealt = () => {
    let n = 0
    let doc = normalizeProjectDocument({ entities: base })
    for (const [pos, type, k] of [['column-bases', 'up-b380f', 4], ['truss:h0', 'up-250bsw', 2]]) {
        const position = positionsOf(doc.entities).find((p) => p.id === pos)
        doc = applyProjectOps(doc, dealOps({ entities: doc.entities, position, filled: new Set(), type: typeById(TYPE_LIBRARY, type), n: k, newId: () => `L${++n}` }).ops)
    }
    return applyProjectOps(doc, [{ type: 'createEntity', payload: { entity: { id: 'rig-show', type: 'group', components: { rigLooks: rigLooksFrom(rig, 'rig.json') } } } }])
}

describe('looks — the rig file\'s looks on the dealt lamps', () => {
    it('renames each group to position/type, and refuses a mount it cannot place', () => {
        expect([...groupKeys(rig)]).toEqual([['beams-cols', 'column-bases/up-b380f'], ['spots', 'truss/up-250bsw']])
        expect(() => groupKeys({ ...rig, groups: [{ id: 'x', class: 'beam', mount: 'crane-bridge' }] })).toThrow(/crane-bridge/)
    })

    it('poses every lamp of a named group by its rule, mirrored, in the look\'s colour', () => {
        const doc = dealt()
        const up = lookPoses({ entities: doc.entities, library: TYPE_LIBRARY, lookId: 'up' })
        expect(up.size).toBe(6)
        const floor = doc.entities.filter((e) => e.components.fixture?.type === 'up-b380f').map((e) => up.get(e.id))
        for (const p of floor) spotAimDirection(p.rotation).forEach((v, k) => expect(v).toBeCloseTo([0, 1, 0][k], 6))
        expect(floor[0].color).toBe('#ff0000')
        const cross = lookPoses({ entities: doc.entities, library: TYPE_LIBRARY, lookId: 'cross' })
        const dirs = doc.entities.filter((e) => e.components.fixture?.type === 'up-b380f').map((e) => [e.components.transform.position[0], spotAimDirection(cross.get(e.id).rotation)])
        for (const [x, d] of dirs) expect(Math.sign(d[0])).toBe(-Math.sign(x)) // each row fires across to the other side
        expect(cross.size).toBe(4) // the truss spots are not in this look: they keep their own
    })

    it('draws the look without writing it, and writes it only when asked to rest on it', () => {
        const doc = dealt()
        const poses = lookPoses({ entities: doc.entities, library: TYPE_LIBRARY, lookId: 'cross' })
        const shown = posedEntities(doc.entities, poses)
        const id = [...poses.keys()][0]
        expect(shown.find((e) => e.id === id).components.transform.rotation).toEqual(poses.get(id).rotation)
        expect(doc.entities.find((e) => e.id === id).components.transform.rotation).not.toEqual(poses.get(id).rotation)
        const rested = applyProjectOps(doc, restOps(doc.entities, poses))
        expect(rested.entities.find((e) => e.id === id).components.transform.rotation).toEqual(poses.get(id).rotation)
    })

    it('makes the desk\'s looks over the room\'s patched fixtures, with no invented values', () => {
        const looks = deskLooks(rigLooksFrom(rig, 'rig.json'), [{ id: 'fx1' }, { id: 'fx2' }])
        expect(looks[0]).toEqual({ id: 'rig-up', name: 'Up', kind: 'all', fixtures: ['fx1', 'fx2'], steps: [{ values: {} }] })
        expect(lookIdOfDesk(deskLookId('roof-cathedral'))).toBe('roof-cathedral')
        expect(lookIdOfDesk('lk123')).toBe(null)
    })
})
