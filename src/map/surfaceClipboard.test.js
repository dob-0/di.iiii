import { describe, expect, it } from 'vitest'
import { PASTE_OFFSET, pastedSurface, surfaceFromClipboardText, surfaceToClipboardText } from './surfaceClipboard.js'

const surface = {
    id: 'srf-a',
    name: 'Screen 1',
    corners: [[0, 0], [0.2, 0], [0.2, 1], [0, 1]],
    source: { kind: 'test', ref: 'card' },
    opacity: 0.8
}

describe('surface clipboard text', () => {
    it('reads back exactly the surface it wrote', () => {
        expect(surfaceFromClipboardText(surfaceToClipboardText(surface))).toEqual(surface)
    })

    it('ignores text that is not a copied surface', () => {
        expect(surfaceFromClipboardText('hello')).toBeNull()
        expect(surfaceFromClipboardText('{"surface":{}}')).toBeNull()
        expect(surfaceFromClipboardText(JSON.stringify({ kind: 'something/else', surface }))).toBeNull()
        expect(surfaceFromClipboardText(null)).toBeNull()
        expect(surfaceFromClipboardText('{"kind":"di.iiii/mapping-surface", broken')).toBeNull()
    })

    // The trap from 2026-10-14: corners sent as "x y" strings reset a surface
    // to the default box. A paste must refuse them rather than land one there.
    it('refuses corners that are not four [x, y] number pairs', () => {
        const asStrings = { ...surface, corners: ['0 0', '0.2 0', '0.2 1', '0 1'] }
        const three = { ...surface, corners: surface.corners.slice(0, 3) }
        expect(surfaceFromClipboardText(surfaceToClipboardText(asStrings))).toBeNull()
        expect(surfaceFromClipboardText(surfaceToClipboardText(three))).toBeNull()
    })
})

describe('pastedSurface', () => {
    it('drops the id, names it a copy and steps it down-right per paste', () => {
        const first = pastedSurface(surface)
        expect(first.id).toBeUndefined()
        expect(first.name).toBe('Screen 1 copy')
        expect(first.corners[0]).toEqual([PASTE_OFFSET, PASTE_OFFSET])
        expect(first.source).toEqual(surface.source)
        expect(first.opacity).toBe(0.8)

        const third = pastedSurface(surface, 3)
        expect(third.corners[2][0]).toBeCloseTo(0.2 + 3 * PASTE_OFFSET)
        expect(third.corners[2][1]).toBeCloseTo(1 + 3 * PASTE_OFFSET)
    })

    it('leaves the copied surface itself untouched', () => {
        pastedSurface(surface, 2)
        expect(surface.corners[0]).toEqual([0, 0])
        expect(surface.id).toBe('srf-a')
    })
})
