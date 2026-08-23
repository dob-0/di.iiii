import { describe, expect, it } from 'vitest'
import { describeRootEmptyCanvas } from './emptyCanvasHint.js'

describe('describeRootEmptyCanvas', () => {
    // The defect this exists for: Studio's "⇄ Nodes" navigates correctly to the
    // same project in Raw, whose graph is genuinely empty because a Studio
    // project has entities and no nodes. The old sentence announced that as
    // "Double-click to place your first node" — indistinguishable from a project
    // with nothing in it, which is what made the crossing read as broken.
    it('names the work that is there when a Studio project has objects but no nodes', () => {
        const hint = describeRootEmptyCanvas({ entityCount: 3 })
        expect(hint).toMatch(/3 objects in the room/)
        expect(hint).toMatch(/See the room/)
        expect(hint).not.toMatch(/place your first node/)
    })

    it('counts one object in the singular', () => {
        expect(describeRootEmptyCanvas({ entityCount: 1 })).toMatch(/1 object in the room/)
    })

    it('keeps the plain invitation for a project that really is empty', () => {
        expect(describeRootEmptyCanvas({ entityCount: 0 })).toBe('Double-click to place your first node.')
    })

    // The local canvas keeps its own sentence whatever it holds: "Built in
    // Studio" would be a lie about a browser-only surface, and which canvas you
    // are standing on outranks what is on it.
    it('says a local canvas is local first', () => {
        const hint = describeRootEmptyCanvas({ isLocalWorkspace: true, entityCount: 4 })
        expect(hint).toMatch(/nothing here is saved to a space yet/)
        expect(hint).not.toMatch(/Built in Studio/)
    })

    it('carries the pointer verb through every branch', () => {
        expect(describeRootEmptyCanvas({ pointerVerb: 'Double-tap' })).toMatch(/Double-tap/)
        expect(describeRootEmptyCanvas({ pointerVerb: 'Double-tap', entityCount: 2 })).toMatch(/Double-tap/)
        expect(describeRootEmptyCanvas({ pointerVerb: 'Double-tap', isLocalWorkspace: true })).toMatch(/Double-tap/)
    })
})
