import { describe, expect, it } from 'vitest'
import { cycleSlot, fullWords, hotbarSlots, slotOfKey } from './hotbar.js'
import { TYPE_LIBRARY } from './types/index.js'

const lamp = (id, type) => ({ id, type: 'spotLight', components: { fixture: { type } } })
const show = (items) => ({ id: 'rig-show', type: 'group', components: { rentalList: { name: 'order', items } } })

describe('hotbarSlots — the palette is the rental list', () => {
    it('puts the pieces first, then each line of the list with what is left', () => {
        const entities = [
            show([{ code: 'UP-250BSW', type: 'up-250bsw', ordered: 12 }, { code: 'UP-YZ31P', type: 'up-yz31p', ordered: 4 }]),
            ...Array.from({ length: 9 }, (_, i) => lamp(`b${i}`, 'up-250bsw')),
            { id: 'p1', type: 'model', components: { piece: { kind: 'truss-3m' } } }
        ]
        const { slots, listed } = hotbarSlots({ entities, library: TYPE_LIBRARY })
        expect(listed).toBe(true)
        expect(slots.map((s) => s.label)).toEqual(['truss 3 m', 'truss 2 m', 'truss 1 m', 'tower', 'deck 2×1', '250BSW', 'YZ31P'])
        expect(slots[0].words).toBe('1 placed')
        expect(slots[5]).toMatchObject({ left: 3, full: false, words: '3 left', key: '6' })
        expect(slots[6]).toMatchObject({ effect: true, left: 4 })
    })

    it('says none are left when the order is placed — the 13th of 12 cannot be taken', () => {
        const entities = [show([{ code: 'UP-250BSW', type: 'up-250bsw', ordered: 12 }]), ...Array.from({ length: 12 }, (_, i) => lamp(`b${i}`, 'up-250bsw'))]
        const slot = hotbarSlots({ entities, library: TYPE_LIBRARY }).slots.find((s) => s.type === 'up-250bsw')
        expect(slot.full).toBe(true)
        expect(slot.words).toBe('none left')
        expect(fullWords(slot)).toMatch(/all 12 UP-250BSW/)
    })

    it('with no list, offers every type in the library, unlimited', () => {
        const { slots, listed } = hotbarSlots({ entities: [], library: TYPE_LIBRARY })
        expect(listed).toBe(false)
        expect(slots.filter((s) => s.kind === 'lamp')).toHaveLength(TYPE_LIBRARY.types.length)
        expect(slots.every((s) => !s.full)).toBe(true)
    })
})

describe('choosing a slot', () => {
    it('scroll wraps both ways; the digit keys pick 1–9 and 0', () => {
        expect(cycleSlot(0, 5, -1)).toBe(4)
        expect(cycleSlot(4, 5, 1)).toBe(0)
        expect(slotOfKey('1', 11)).toBe(0)
        expect(slotOfKey('0', 11)).toBe(9)
        expect(slotOfKey('0', 5)).toBe(-1)
        expect(slotOfKey('x', 5)).toBe(-1)
    })
})
