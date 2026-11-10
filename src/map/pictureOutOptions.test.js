import { describe, expect, it } from 'vitest'
import { buildPictureOutOptions } from './pictureOutOptions.js'

describe('buildPictureOutOptions', () => {
    it('offers Picture Out nodes and the VJ Deck, nothing else', () => {
        const doc = { nodes: [
            { id: 'a', typeId: 'top.out', label: 'Main' },
            { id: 'b', typeId: 'top.out' },
            { id: 'd', typeId: 'vj.deck', label: 'Deck' },
            { id: 'x', typeId: 'top.noise' }
        ] }
        expect(buildPictureOutOptions(doc)).toEqual([
            { id: 'a', label: 'Main' },
            { id: 'b', label: 'Picture Out' },
            { id: 'd', label: 'VJ Deck — Deck' }
        ])
        expect(buildPictureOutOptions(null)).toEqual([])
    })
})
