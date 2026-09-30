import { describe, expect, it, vi } from 'vitest'
import { WASH_ENTITY_ID, isWashEntityId, lookIdOfWash, perLookWashesOf, washEntityId, washLevelOf, withLookWash, withWashLevel } from './looks.js'

// RIG_BUILD.md §15.13 — one baked wash per look. The single `rig-wash` is baked for one look and
// the room could only fade it: every other scene showed that look's lamps in that look's colour.
const wash = (id, extra = {}) => ({ id, type: 'model', components: { transform: { position: [0, 0, 0] }, media: { assetId: `asset-${id}` }, ...extra } })
const lamp = { id: 'rig-a-01', type: 'spotLight', components: { light: { intensity: 1 } } }
const opacityOf = (list, id) => list.find((e) => e.id === id)?.components?.appearance?.opacity
const visibleOf = (list, id) => list.find((e) => e.id === id)?.components?.runtime?.visible

describe('the wash ids', () => {
    it('names a look\'s wash and reads it back; the single wash is not a look\'s', () => {
        expect(washEntityId('gs-red-room')).toBe('rig-wash:gs-red-room')
        expect(lookIdOfWash('rig-wash:gs-red-room')).toBe('gs-red-room')
        expect(lookIdOfWash('rig-wash')).toBe(null)
        expect(lookIdOfWash('rig-wash:')).toBe(null)
        expect(lookIdOfWash('rig-washer')).toBe(null)
        expect(isWashEntityId('rig-wash')).toBe(true)
        expect(isWashEntityId('rig-wash:x')).toBe(true)
        expect(isWashEntityId('rig-beams')).toBe(false)
        expect([...perLookWashesOf([lamp, wash(WASH_ENTITY_ID), wash('rig-wash:a'), wash('rig-wash:b')]).keys()]).toEqual(['a', 'b'])
    })
})

describe('withLookWash — the room shows the playing look\'s wash', () => {
    it('leaves an existing project (one single rig-wash, no per-look) untouched: the same array', () => {
        const entities = withWashLevel([lamp, wash(WASH_ENTITY_ID)], washLevelOf({ aims: { 'column-faces/up-pl5403': { rule: 'x' } }, levels: { 'column-faces/up-pl5403': 0.4 } }))
        expect(opacityOf(entities, WASH_ENTITY_ID)).toBe(0.4)
        expect(withLookWash(entities, { toLookId: 'a', t: 1 })).toBe(entities)
        expect(withLookWash(entities, { fromLookId: 'b', toLookId: 'a', t: 0.3 })).toBe(entities)
    })

    it('with no look playing, the per-look washes stay as the document wrote them (hidden)', () => {
        const entities = [lamp, wash('rig-wash:a', { runtime: { visible: false } })]
        expect(withLookWash(entities, { toLookId: '' })).toBe(entities)
    })

    it('shows the playing look\'s wash at full, hides the others and the single one', () => {
        const entities = [lamp, wash(WASH_ENTITY_ID), wash('rig-wash:a', { runtime: { visible: false } }), wash('rig-wash:b', { runtime: { visible: false } })]
        const out = withLookWash(entities, { toLookId: 'b' })
        expect(opacityOf(out, 'rig-wash:b')).toBe(1)
        expect(visibleOf(out, 'rig-wash:b')).toBe(true)
        expect(visibleOf(out, 'rig-wash:a')).toBe(false)
        expect(opacityOf(out, 'rig-wash:a')).toBe(0)
        expect(visibleOf(out, WASH_ENTITY_ID)).toBe(false)
        expect(out.find((e) => e.id === lamp.id)).toBe(lamp)
        expect(entities[2].components.runtime.visible).toBe(false) // the document is not written
    })

    it('cross-fades: from at 1 − t, to at t, continuous to the landed drawing', () => {
        const entities = [wash('rig-wash:a'), wash('rig-wash:b'), wash('rig-wash:c')]
        const at = (t) => withLookWash(entities, { fromLookId: 'a', toLookId: 'b', t })
        expect(opacityOf(at(0), 'rig-wash:a')).toBe(1)
        expect(opacityOf(at(0), 'rig-wash:b')).toBe(0)
        expect(visibleOf(at(0), 'rig-wash:b')).toBe(false)
        let last = -1
        for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const o = at(t)
            expect(opacityOf(o, 'rig-wash:a')).toBeCloseTo(1 - t, 10)
            expect(opacityOf(o, 'rig-wash:b')).toBeCloseTo(t, 10)
            expect(opacityOf(o, 'rig-wash:b')).toBeGreaterThan(last)
            last = opacityOf(o, 'rig-wash:b')
            expect(visibleOf(o, 'rig-wash:c')).toBe(false)
        }
        const landed = at(1)
        expect(opacityOf(landed, 'rig-wash:b')).toBe(1)
        expect(visibleOf(landed, 'rig-wash:a')).toBe(false)
        expect(landed).toEqual(withLookWash(entities, { toLookId: 'b' }))
        // a fade from a look to itself is no fade
        expect(withLookWash(entities, { fromLookId: 'b', toLookId: 'b', t: 0.5 })).toEqual(landed)
    })

    it('a look with no wash of its own falls back to the single rig-wash as withWashLevel drew it', () => {
        const single = { ...wash(WASH_ENTITY_ID), components: { ...wash(WASH_ENTITY_ID).components, appearance: { opacity: 0.6 } } }
        const entities = [single, wash('rig-wash:a')]
        const out = withLookWash(entities, { toLookId: 'b' })
        expect(out.find((e) => e.id === WASH_ENTITY_ID)).toBe(single)
        expect(visibleOf(out, 'rig-wash:a')).toBe(false)
        // and mid-fade from a look that has one: that one fades out while the single carries the new look
        const mid = withLookWash(entities, { fromLookId: 'a', toLookId: 'b', t: 0.25 })
        expect(opacityOf(mid, 'rig-wash:a')).toBe(0.75)
        expect(mid.find((e) => e.id === WASH_ENTITY_ID)).toBe(single)
    })

    it('a per-look wash whose asset the document does not hold counts as missing', () => {
        const entities = [wash(WASH_ENTITY_ID), wash('rig-wash:a'), wash('rig-wash:b')]
        const assets = [{ id: 'asset-rig-wash:a' }] // b's file is not in the document
        const out = withLookWash(entities, { toLookId: 'b', assets })
        expect(visibleOf(out, 'rig-wash:b')).toBe(false)
        expect(out.find((e) => e.id === WASH_ENTITY_ID)).toBe(entities[0]) // the fallback
        expect(visibleOf(withLookWash(entities, { toLookId: 'a', assets }), 'rig-wash:a')).toBe(true)
    })
})

describe('the room hook cross-fades the per-look washes with the lamps (useRigLookEntities)', () => {
    const mirrorOf = (snapshot) => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, probe: () => Promise.resolve(true), watch: () => () => {} })

    it('shows the desk\'s look\'s wash, fades the previous out on the fade\'s tick, and lands', async () => {
        const { renderHook, act } = await import('@testing-library/react')
        const { useRigLookEntities } = await import('./useRigLook.js')
        const { deskLookId } = await import('./looks.js')
        vi.useFakeTimers({ now: 100_000 })
        try {
            const doc = {
                entities: [
                    { id: 'rig-show', type: 'group', components: { rigLooks: { looks: [{ id: 'up', title: 'Up' }, { id: 'cross', title: 'Cross' }] } } },
                    wash('rig-wash:up', { runtime: { visible: false } }), wash('rig-wash:cross', { runtime: { visible: false } })
                ],
                assets: [{ id: 'asset-rig-wash:up' }, { id: 'asset-rig-wash:cross' }]
            }
            const snapshot = { present: true, fixtures: [], looks: [deskLookId('cross')], lookFade: { lookId: deskLookId('cross'), from: deskLookId('up'), fadeMs: 4000, firedAt: 99_000 } }
            const { result } = renderHook(({ d }) => useRigLookEntities(d, { mirror: mirrorOf(snapshot) }), { initialProps: { d: doc } })
            expect(result.current.fading).toBe(true)
            expect(opacityOf(result.current.entities, 'rig-wash:cross')).toBeCloseTo(0.25, 5)
            expect(opacityOf(result.current.entities, 'rig-wash:up')).toBeCloseTo(0.75, 5)
            await act(async () => { vi.advanceTimersByTime(1000) })
            expect(opacityOf(result.current.entities, 'rig-wash:cross')).toBeGreaterThan(0.4)
            await act(async () => { vi.advanceTimersByTime(4000) })
            expect(result.current.fading).toBe(false)
            expect(opacityOf(result.current.entities, 'rig-wash:cross')).toBe(1)
            expect(visibleOf(result.current.entities, 'rig-wash:up')).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })
})
