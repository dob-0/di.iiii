import { describe, it, expect } from 'vitest'
import { withLookMedia } from './lookMedia.js'
import { roomInLook } from './useRigLook.js'

const wall = { id: 'w', type: 'image', components: { appearance: { opacity: 1 }, media: { assetId: 'red', fit: 'contain' }, lookMedia: { byLook: { red: 'red', ice: 'ice' } } } }
const lamp = { id: 'l', type: 'spotLight', components: {} }

describe('the wall follows the look (owner N3855)', () => {
    it('shows the look\'s own asset and keeps the rest of the media', () => {
        const out = withLookMedia([wall, lamp], 'ice')
        expect(out[0].components.media).toEqual({ assetId: 'ice', fit: 'contain' })
        expect(out[1]).toBe(lamp)
    })
    it('is dark in a look the map does not name, never the last picture', () => {
        expect(withLookMedia([wall], 'blackout')[0].components.appearance.opacity).toBe(0)
    })
    it('changes nothing with no look, with no map, or when the asset is already on', () => {
        const list = [wall, lamp]
        expect(withLookMedia(list, '')).toBe(list)
        expect(withLookMedia(list, 'red')).toBe(list)
        expect(withLookMedia([lamp], 'ice')[0]).toBe(lamp)
    })
    it('the room in a look carries it, also when the look poses no lamp', () => {
        const out = roomInLook({ entities: [wall], library: null, looks: { looks: [{ id: 'ice' }] }, lookId: 'ice' })
        expect(out[0].components.media.assetId).toBe('ice')
    })
})
