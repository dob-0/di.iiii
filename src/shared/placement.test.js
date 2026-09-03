import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { placeOps, slotAt, scaleFor, normalizePlacement } from './placement.js'

const require = createRequire(import.meta.url)
const serverTwin = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../shared/placement.cjs'))

const ON = { enabled: true, layout: { rows: [1.15, 3.35], gap: 3.7, slotHeight: 2, maxWidth: 3.4, back: { z: -7.5 }, wings: { x: 6.2, z: -2 } } }
const doc = (entities = [], placement = ON, assets = []) => ({ entities, assets, worldState: { placement } })
const image = (id, position = [0, 0, 0], extra = {}) => ({
    id,
    type: 'image',
    name: id,
    components: { transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, media: { assetId: `asset-${id}` }, ...extra },
})
const create = (entity) => ({ type: 'createEntity', payload: { entity } })
const move = (entityId, position) => ({ type: 'updateComponent', payload: { entityId, component: 'transform', patch: { position } } })
const transformsOf = (ops) => ops.filter((op) => op.type === 'updateComponent' && op.payload.component === 'transform')

describe('placement', () => {
    // The whole point: a phone drops a photo at the origin with no thought about
    // where it should hang, and the room hangs it anyway.
    it('hangs a photo dropped at the origin in the first free slot', () => {
        const ops = placeOps(doc(), [create(image('a'))])
        expect(ops).toHaveLength(2)
        const [placed] = transformsOf(ops)
        expect(placed.payload.entityId).toBe('a')
        expect(placed.payload.patch.position).toEqual([0, 1.15, -7.5])
        // slotHeight 2 over a plane built 3 units tall
        expect(placed.payload.patch.scale).toEqual([2 / 3, 2 / 3, 2 / 3])
    })

    // Two people adding at once must not land on top of each other — the second
    // create in a batch has to see the slot the first one just took.
    it('gives each photo in one batch its own slot', () => {
        const ops = placeOps(doc(), [create(image('a')), create(image('b')), create(image('c'))])
        const positions = transformsOf(ops).map((op) => op.payload.patch.position)
        expect(positions).toEqual([slotAt({}, 0).position, slotAt({}, 1).position, slotAt({}, 2).position])
    })

    // Occupancy is read back from the room, so a restart, another session or a
    // hand edit can never hand out a slot twice.
    it('skips slots that photos already standing in the room occupy', () => {
        const room = doc([image('old', slotAt({}, 0).position), image('older', slotAt({}, 1).position)])
        const [placed] = transformsOf(placeOps(room, [create(image('new'))]))
        expect(placed.payload.patch.position).toEqual(slotAt({}, 2).position)
    })

    // Delete one and its slot comes back — no bookkeeping to drift.
    it('reuses the slot of a photo deleted earlier in the same batch', () => {
        const room = doc([image('old', slotAt({}, 0).position)])
        const ops = placeOps(room, [{ type: 'deleteEntity', payload: { entityId: 'old' } }, create(image('new'))])
        const [placed] = transformsOf(ops)
        expect(placed.payload.patch.position).toEqual(slotAt({}, 0).position)
    })

    // The drag still chooses WHERE on the wall. It just cannot choose nowhere.
    it('snaps a photo dragged into the void to the nearest free slot', () => {
        const room = doc([image('a', slotAt({}, 0).position)])
        const near = slotAt({}, 4).position
        const ops = placeOps(room, [move('a', [near[0] + 0.9, near[1] - 0.4, near[2] + 0.6])])
        expect(ops).toHaveLength(1)
        expect(ops[0].payload.patch.position).toEqual(near)
    })

    it('does not let a drag land on a slot someone else is standing in', () => {
        const room = doc([image('a', slotAt({}, 0).position), image('b', slotAt({}, 4).position)])
        const ops = placeOps(room, [move('a', slotAt({}, 4).position)])
        expect(ops[0].payload.patch.position).not.toEqual(slotAt({}, 4).position)
    })

    // The room must not swallow its own furniture: the QR on its lectern is
    // pinned by hand and keeps its place.
    it('leaves a pinned photo exactly where the author put it', () => {
        const qr = image('qr', [-2.2, 0.3, 0.8], { placement: { pinned: true } })
        const ops = placeOps(doc([qr]), [move('qr', [-2.2, 0.3, 0.9])])
        expect(ops).toHaveLength(1)
        expect(ops[0].payload.patch.position).toEqual([-2.2, 0.3, 0.9])
    })

    it('leaves everything that is not hangable alone', () => {
        const text = { id: 't', type: 'text', components: { transform: { position: [0, 0, 0] } } }
        const ops = placeOps(doc([text]), [create(text), move('t', [5, 5, 5])])
        expect(ops).toHaveLength(2)
        expect(ops[1].payload.patch.position).toEqual([5, 5, 5])
    })

    // A switch, not a migration: off means the batch is returned untouched.
    it('changes nothing when a room has placement off', () => {
        const ops = [create(image('a')), move('a', [9, 9, 9])]
        expect(placeOps(doc([], null), ops)).toEqual(ops)
        expect(placeOps(doc([], { ...ON, enabled: false }), ops)).toEqual(ops)
    })

    // The wall grows rather than running out: slot 200 exists as surely as slot 1.
    it('grows the wall outward instead of running out of slots', () => {
        const far = slotAt({}, 200)
        expect(Number.isFinite(far.position[0])).toBe(true)
        const room = doc(Array.from({ length: 30 }, (_, i) => image(`p${i}`, slotAt({}, i).position)))
        const [placed] = transformsOf(placeOps(room, [create(image('next'))]))
        expect(placed.payload.patch.position).toEqual(slotAt({}, 30).position)
    })

    // A banner is 3.3:1; at the row height it would be five units wide and eat
    // its neighbours, so it hangs smaller. Only assets whose proportions the
    // server recorded can be capped — the rest keep the row height.
    it('scales a banner down to the slot width when the asset carries its size', () => {
        expect(scaleFor(ON.layout, { width: 2748, height: 834 })).toBeCloseTo(3.4 / (3 * (2748 / 834)), 6)
        expect(scaleFor(ON.layout, { width: 3024, height: 4032 })).toBeCloseTo(2 / 3, 6)
        expect(scaleFor(ON.layout, null)).toBeCloseTo(2 / 3, 6)
    })

    // The server runs the .cjs twin and the editor runs this one. If they ever
    // disagree, a photo lands in one place on the wall and is drawn in another.
    it('agrees with the server twin, slot for slot', () => {
        const room = doc([image('a', slotAt({}, 0).position)])
        const batch = [create(image('b')), move('a', [4, 2, -6])]
        expect(serverTwin.placeOps(room, batch)).toEqual(placeOps(room, batch))
        for (const i of [0, 1, 2, 5, 17, 200]) expect(serverTwin.slotAt({}, i)).toEqual(slotAt({}, i))
    })

    it('defaults a room that only says enabled to the standard three walls', () => {
        const placement = normalizePlacement({ enabled: true })
        expect(placement.layout.rows).toHaveLength(2)
        expect(placement.types).toEqual(['image', 'video'])
    })
})
