import { describe, expect, it } from 'vitest'
import { scopeHasRoomContent } from './roomContent.js'

const node = (id, typeId, parentId = null) => ({ id, typeId, parentId, values: {} })

describe('scopeHasRoomContent — the room appears only when something stands in it', () => {
    it('an empty desk has no room', () => {
        expect(scopeHasRoomContent([], null)).toBe(false)
    })

    it('a Geo at root is something standing in the room', () => {
        expect(scopeHasRoomContent([node('g', 'geom.geo')], null)).toBe(true)
    })

    it('a cube at root counts too', () => {
        expect(scopeHasRoomContent([node('c', 'geom.cube')], null)).toBe(true)
    })

    // A Scene is panel-2d and the backdrop deliberately does not see through
    // it — a desk holding only a Scene card must NOT show an empty room
    // pretending to be that scene.
    it('a Scene alone does not conjure a room', () => {
        expect(scopeHasRoomContent([node('w', 'universe.world')], null)).toBe(false)
    })

    // An unparented Light draws nothing (it is the scope light rig, not a
    // lamp) — it cannot be the reason a room appears.
    it('an unparented Light alone does not conjure a room', () => {
        expect(scopeHasRoomContent([node('l', 'world.light')], null)).toBe(false)
    })

    it('a Light standing inside a container counts in that scope', () => {
        const nodes = [node('g', 'geom.geo'), node('l', 'world.light', 'g')]
        expect(scopeHasRoomContent(nodes, 'g')).toBe(true)
    })

    it('scoping is per level: an empty Geo has no room inside even when the root does', () => {
        const nodes = [node('g', 'geom.geo'), node('c', 'geom.cube')]
        expect(scopeHasRoomContent(nodes, null)).toBe(true)
        expect(scopeHasRoomContent(nodes, 'g')).toBe(false)
    })

    it('a child in another scope does not leak into this one', () => {
        const nodes = [node('g', 'geom.geo'), node('c', 'geom.cube', 'g')]
        expect(scopeHasRoomContent(nodes, null)).toBe(true)
        expect(scopeHasRoomContent(nodes, 'g')).toBe(true)
        expect(scopeHasRoomContent(nodes, 'other')).toBe(false)
    })
})
