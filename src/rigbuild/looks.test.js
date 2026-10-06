import { describe, expect, it, vi } from 'vitest'
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
        expect(() => groupKeys({ ...rig, groups: [{ id: 'x', class: 'beam', mount: 'stage-front-deck' }] })).toThrow(/stage-front-deck/)
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

    // MOXIR 2026-10-01: floor movers standing near, not on, a column base were on no derived slot,
    // so no look ever posed them and every beam look stayed dark on the desk and in the room.
    it('places a lamp no derived slot holds by the position its fixture names, and only an unambiguous one', () => {
        const doc = dealt()
        const one = doc.entities.find((e) => e.components.fixture?.type === 'up-b380f')
        const off = (id, position, dx) => ({ ...one, id, components: { ...one.components, transform: { ...one.components.transform, position: [one.components.transform.position[0] + dx, one.components.transform.position[1], one.components.transform.position[2] + 1.7] }, fixture: { ...one.components.fixture, index: undefined, position } } })
        const entities = [...doc.entities, off('near-base', 'column bases', 0.6), off('booth', 'booth back', -0.6)]
        const up = lookPoses({ entities, library: TYPE_LIBRARY, lookId: 'up' })
        expect(up.has('near-base')).toBe(true)
        expect(up.get('near-base').color).toBe('#ff0000')
        expect(up.has('booth')).toBe(false) // "booth back" is stage-back OR stage-flanks: not guessed
        expect(up.size).toBe(7)
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

describe('a look\'s level in the room (RIG_BUILD.md §15)', () => {
    it('scales the light and the cone\'s haze, keeps a beam-only lamp beam-only, and leaves the document alone', async () => {
        const { posedEntities, levelOfKey, restOps } = await import('./looks.js')
        const e = { id: 'a', type: 'spotLight', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0] }, light: { color: '#fff', intensity: 10 }, beam: { visible: true, haze: 0.6, only: true } } }
        const poses = new Map([['a', { position: [0, 1, 0], rotation: [0, 0, 0], color: '#ff0000', level: 0 }]])
        const [out] = posedEntities([e], poses)
        expect(out.components.light).toEqual({ color: '#ff0000', intensity: 0 })
        expect(out.components.beam).toEqual({ visible: true, haze: 0, only: true })
        expect(e.components.light.intensity).toBe(10)
        expect(levelOfKey({ levels: { 'pit/x': 0.25 } }, 'pit/x')).toBe(0.25)
        expect(levelOfKey({}, 'pit/x')).toBe(1)
        // resting writes aims and colours, never a level (the document has no nominal to return to)
        expect(restOps([e], poses).some((op) => op.payload.patch?.intensity !== undefined || op.payload.component === 'beam')).toBe(false)
    })
})

// RIG_BUILD.md §15.6 — a cue's fade in the room. The room hands its drawing up to its parent
// (RoomLookFollower → PublicProjectViewer), which re-renders on it: if a re-render alone made
// a new drawing, the two fed each other forever ("Maximum update depth exceeded", seen in dev
// 2026-09-28 — the fade's t was read from the clock in render).
describe('the room between two looks (useRigLookEntities)', () => {
    const mirrorOf = (snapshot) => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, probe: () => Promise.resolve(true), watch: () => () => {} })

    it('draws a fade part-way, and a re-render without the clock\'s tick is the same drawing', async () => {
        const { renderHook, act } = await import('@testing-library/react')
        const { useRigLookEntities } = await import('./useRigLook.js')
        vi.useFakeTimers({ now: 100_000 })
        try {
            const doc = dealt()
            const snapshot = { present: true, fixtures: [], looks: [deskLookId('cross')], lookFade: { lookId: deskLookId('cross'), from: deskLookId('up'), fadeMs: 4000, firedAt: 99_000 } }
            const { result, rerender } = renderHook(({ d }) => useRigLookEntities(d, { mirror: mirrorOf(snapshot) }), { initialProps: { d: doc } })
            const first = result.current.entities
            expect(result.current.fading).toBe(true)
            vi.setSystemTime(100_050) // the clock moves; the fade's own tick has not fired
            rerender({ d: doc })
            expect(result.current.entities).toBe(first) // no tick, no new drawing
            await act(async () => { vi.advanceTimersByTime(200) })
            expect(result.current.entities).not.toBe(first) // the tick moves it on
            await act(async () => { vi.advanceTimersByTime(5000) })
            expect(result.current.fading).toBe(false)
            const landed = result.current.entities
            rerender({ d: doc })
            expect(result.current.entities).toBe(landed)
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('solo_mask — several lamps of a group kept lit (crane-x, RIG_BUILD §15.8)', async () => {
    const { soloKeeps } = await import('./looks.js')
    const { soloKeeps: scriptKeeps } = await import('../../scripts/place/rig-lib.mjs')
    it('keeps the ranks whose bit is set, as the rig script does', () => {
        for (const aim of [{ solo_mask: 85 }, { solo_mask: 65 }, { solo: 3 }, {}, { solo_mask: 448 }]) {
            for (let r = 0; r < 12; r++) expect(soloKeeps(aim, r), JSON.stringify(aim) + r).toBe(scriptKeeps(aim, r))
        }
        expect([0, 1, 2, 3, 4, 5, 6].filter((r) => soloKeeps({ solo_mask: 85 }, r))).toEqual([0, 2, 4, 6])
    })
})

// MOXIR 2026-10-01: the desk runs one patch per space. Swapping Known · full off and Known on
// left Known · full's 20 looks on the desk; the six it alone has (Doors, The X…) lit nothing
// on Known, and a look of the same name could not be told apart on the Touch page.
describe('a desk swap takes the other room\'s looks away', () => {
    it('names the desk\'s rig looks this room does not have, and never an operator\'s own', async () => {
        const { staleDeskLooks } = await import('./looks.js')
        const desk = [{ id: 'rig-k-doors' }, { id: 'rig-gs-red-room' }, { id: 'lk123' }, { id: 'my-chase' }, { id: 'rig-k-tunnel' }]
        expect(staleDeskLooks(desk, ['rig-gs-red-room', 'rig-k-tunnel'])).toEqual(['rig-k-doors'])
        expect(staleDeskLooks([], ['rig-x'])).toEqual([])
        expect(staleDeskLooks(undefined, [])).toEqual([])
    })
})
