import { describe, expect, it, vi } from 'vitest'
import { createWalkBuilder, aimFrom } from './walkBuilder.js'
import { hotbarSlots } from '../../rigbuild/hotbar.js'
import { plotModel } from '../../rigbuild/plotModel.js'
import { TYPE_LIBRARY } from '../../rigbuild/types/index.js'
import { lensFromMount } from '../../rigbuild/lampGeometry.js'
import { firstHit, reachFrom } from '../../objectComponents/beamReach.js'

const DOWN_AHEAD = { origin: [0, 1.6, 0], direction: [0, -0.7071, -0.7071] }
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra })

const hand = (over = {}) => {
    let entities = []
    const slots = hotbarSlots({ entities, library: TYPE_LIBRARY }).slots
    const state = { slotIndex: 5, inventory: false, yaw: 0 }
    const d = {
        slots: () => slots, slotIndex: () => state.slotIndex, entities: () => entities, library: () => TYPE_LIBRARY,
        model: () => plotModel({ entities, library: TYPE_LIBRARY }),
        inventoryOpen: () => state.inventory, yaw: () => state.yaw,
        apply: vi.fn((ops) => { for (const op of ops) { if (op.type === 'createEntity') entities = [...entities, op.payload.entity]; if (op.type === 'deleteEntity') entities = entities.filter((e) => e.id !== op.payload.entityId) } }),
        say: vi.fn(), pick: vi.fn((i) => { state.slotIndex = i }), setInventory: vi.fn((o) => { state.inventory = o }),
        setYaw: vi.fn((y) => { state.yaw = y }), undo: vi.fn(), redo: vi.fn(),
        newId: (() => { let n = 0; return () => `e${++n}` })(), ensureAsset: vi.fn(async () => 'asset-1'),
        ...over
    }
    return { d, builder: createWalkBuilder(d), entities: () => entities, state }
}
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('the Studio walk builder', () => {
    it('1-9 pick a slot, E opens the inventory, R turns, Ctrl+Z undoes', () => {
        const { d, builder } = hand()
        expect(builder.key(key('7'))).toBe(true)
        expect(d.pick).toHaveBeenCalledWith(6)
        expect(builder.key(key('e'))).toBe(true)
        expect(d.setInventory).toHaveBeenCalledWith(true)
    })

    it('R turns the piece a quarter; Ctrl+Z undoes, Ctrl+Shift+Z redoes — and an unrelated key is not taken', () => {
        const { d, builder } = hand()
        expect(builder.key(key('r'))).toBe(true)
        expect(d.setYaw).toHaveBeenCalledTimes(1)
        expect(builder.key(key('z', { ctrlKey: true }))).toBe(true)
        expect(d.undo).toHaveBeenCalledTimes(1)
        expect(builder.key(key('z', { ctrlKey: true, shiftKey: true }))).toBe(true)
        expect(d.redo).toHaveBeenCalledTimes(1)
        expect(builder.key(key('w'))).toBe(false)
    })

    it('a click places the lamp in hand where you aim as ONE op; right-click removes it as one', async () => {
        const { d, builder, entities } = hand()
        expect(builder.pointer({ button: 0 }, DOWN_AHEAD)).toBe(true)
        await settle()
        expect(d.apply).toHaveBeenCalledTimes(1)
        expect(d.apply.mock.calls[0][0]).toHaveLength(1)
        expect(d.apply.mock.calls[0][0][0].type).toBe('createEntity')
        expect(entities()).toHaveLength(1)
        const lens = entities()[0].components.transform.position
        // aim at the lamp itself from the side: the crosshair is on it, the remove gesture takes it
        const ray = { origin: [lens[0], lens[1], lens[2] + 2], direction: [0, 0, -1] }
        builder.pointer({ button: 2 }, ray)
        expect(d.apply).toHaveBeenCalledTimes(2)
        expect(d.apply.mock.calls[1][0].map((o) => o.type)).toEqual(['deleteEntity'])
        expect(entities()).toHaveLength(0)
    })

    it('aiming at nothing places nothing and says why', async () => {
        const { d, builder } = hand()
        builder.pointer({ button: 0 }, { origin: [0, 1.6, 0], direction: [0, 1, 0] })
        await settle()
        expect(d.apply).not.toHaveBeenCalled()
        expect(d.say).toHaveBeenCalled()
        builder.pointer({ button: 2 }, DOWN_AHEAD)
        expect(d.apply).not.toHaveBeenCalled()
        expect(d.say).toHaveBeenLastCalledWith('aim at a piece or a lamp to remove it')
    })

    it('with the inventory open the room holds still: E / Esc close it, every other key is taken', () => {
        const { d, builder, state } = hand()
        state.inventory = true
        expect(builder.holds()).toBe(true)
        expect(builder.key(key('w'))).toBe(true)
        expect(d.pick).not.toHaveBeenCalled()
        const relock = vi.fn()
        expect(builder.key(key('Escape'), { relock })).toBe(true)
        expect(d.setInventory).toHaveBeenCalledWith(false)
        expect(relock).toHaveBeenCalled()
    })

    it('a placed lamp\'s beam stops at the first surface (beamReach.js)', async () => {
        const { builder, entities } = hand()
        builder.pointer({ button: 0 }, DOWN_AHEAD)
        await settle()
        const lamp = entities()[0]
        const type = TYPE_LIBRARY.types.find((t) => t.id === lamp.components.fixture.type)
        const lens = lamp.components.transform.position
        expect(lens).toEqual(expect.any(Array))
        // standing lamp: the beam leaves +Y; a ceiling 4 m up and a farther one 9 m up — the first is the stop
        const from = lensFromMount({ mount: [lens[0], 0, lens[2]], type })
        const ceilings = [{ normal: [0, 1, 0], point: [0, 9, 0] }, { normal: [0, 1, 0], point: [0, 4, 0] }]
        const hit = firstHit(from, [0, 1, 0], ceilings)
        expect(hit).toBeCloseTo(4 - from[1], 5)
        expect(reachFrom(hit, 30)).toBeLessThan(30)
        expect(reachFrom(hit, 30)).toBeLessThan(hit)
    })
})

describe('aimFrom', () => {
    it('finds the floor under the crosshair for a lamp in hand', () => {
        const slots = hotbarSlots({ entities: [], library: TYPE_LIBRARY }).slots
        const aim = aimFrom({ ...DOWN_AHEAD, model: plotModel({ entities: [], library: TYPE_LIBRARY }), slot: slots[5] })
        expect(aim.place?.ok).toBe(true)
        expect(aim.lampId).toBe(null)
    })
})
