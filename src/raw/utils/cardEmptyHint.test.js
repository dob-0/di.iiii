import { describe, expect, it } from 'vitest'
import { createNode } from '../../project/nodeRegistry.js'
import { cardEmptyHint } from './cardEmptyHint.js'

const n = (typeId, id = typeId) => createNode(typeId, { id })

describe('cardEmptyHint — an empty box says what it waits for', () => {
    it('a picture operator with nothing wired in asks for a picture, by its port name', () => {
        expect(cardEmptyHint(n('top.blur'))).toBe('Wire a picture into In')
        expect(cardEmptyHint(n('top.blur'), { edges: [{ toNodeId: 'top.blur', toPort: 'a' }] })).toBeNull()
    })

    it('a generator makes its own picture and gets no hint', () => {
        expect(cardEmptyHint(n('top.noise'))).toBeNull()
        expect(cardEmptyHint(n('top.ramp'))).toBeNull()
    })

    it('a shape node with no shape asks for one; with a shape it is quiet', () => {
        expect(cardEmptyHint(n('shape.merge'))).toBe('Wire a shape into A')
        expect(cardEmptyHint(n('geom.transform'))).toBe('Wire a shape into Geometry')
        expect(cardEmptyHint(n('shape.merge'), { hasShape: true })).toBeNull()
    })

    it('Geo and Constructor are filled from inside', () => {
        expect(cardEmptyHint(n('geom.geo'))).toBe('Place shapes inside ›')
        expect(cardEmptyHint(n('geom.constructor'))).toBe('Place shapes inside ›')
    })

    it('a Cube always has its own body — no hint', () => {
        expect(cardEmptyHint(n('geom.cube'))).toBeNull()
    })
})
