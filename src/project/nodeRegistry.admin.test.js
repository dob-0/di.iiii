import { describe, expect, it } from 'vitest'
import {
    NODE_TYPES,
    isNodeDeletable,
    isNodeTypeAdminOnly,
    isNodeTypeDeletable
} from './nodeRegistry.js'

const adminTypes = Object.values(NODE_TYPES).filter((t) => t.category === 'admin')

describe('admin node types', () => {
    it('there is at least one, or the rest of this file is vacuous', () => {
        expect(adminTypes.length).toBeGreaterThan(0)
    })

    // THE RULE THAT MATTERS MOST. An admin surface reachable from graph
    // evaluation is a delete wired to a signal — someone eventually connects a
    // clock to it "to see what happens". Admin nodes take no inputs at all, so
    // there is no wire to make. This is a test rather than a comment because a
    // comment does not fail CI.
    it('declare no input ports — nothing upstream can ever drive an admin surface', () => {
        for (const type of adminTypes) {
            expect(type.inputs, `${type.id} must declare no inputs`).toEqual([])
        }
    })

    // An admin window closes (frame.visible === false); it does not delete.
    // Otherwise Backspace on a selected window removes the admin tool from the
    // desk and the only way back is knowing a palette command exists.
    it('are not deletable', () => {
        for (const type of adminTypes) {
            expect(isNodeTypeDeletable(type.id), `${type.id} must not be deletable`).toBe(false)
            expect(isNodeDeletable({ typeId: type.id })).toBe(false)
        }
    })

    it('are flagged adminOnly so the palette can withhold them', () => {
        for (const type of adminTypes) {
            expect(isNodeTypeAdminOnly(type.id), `${type.id} must be adminOnly`).toBe(true)
        }
    })

    it('render as panel windows — an admin surface with no window is unreachable', () => {
        for (const type of adminTypes) {
            expect(type.render).toBe('panel-2d')
        }
    })
})

describe('deletability of everything else', () => {
    it('ordinary nodes stay deletable', () => {
        expect(isNodeTypeDeletable('math.add')).toBe(true)
        expect(isNodeTypeAdminOnly('math.add')).toBe(false)
    })

    // A typo in a document must not strand a node no one can remove.
    it('an unknown type is deletable, so a bad typeId cannot pin a node forever', () => {
        expect(isNodeTypeDeletable('does.not.exist')).toBe(true)
        expect(isNodeDeletable({ typeId: undefined })).toBe(true)
        expect(isNodeDeletable(null)).toBe(true)
    })
})
