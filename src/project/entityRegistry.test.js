import { describe, expect, it } from 'vitest'
import { createEntityOfType } from './entityRegistry.js'

// createEntityOfType is the single funnel every "add an entity" path goes
// through — Studio's Create window, quick insert, paste and duplicate — so it
// is where "a video added to a space brings its sound with it" has to hold.
describe('createEntityOfType', () => {
    it('gives a newly added video spatial sound, unmuted and audible', () => {
        const video = createEntityOfType('video')
        expect(video.type).toBe('video')
        expect(video.components.media.spatial).toBe(true)
        expect(video.components.media.muted).toBe(false)
        // Placement values still have to be sane or the panner misbehaves.
        expect(video.components.media.distance).toBeGreaterThan(0)
        expect(video.components.media.maxDistance).toBeGreaterThanOrEqual(video.components.media.distance)
    })

    it('lets an explicit override win, so a paste or clone keeps its own sound', () => {
        const pasted = createEntityOfType('video', {
            components: { media: { assetId: 'a', spatial: false, muted: true } }
        })
        expect(pasted.components.media.spatial).toBe(false)
        expect(pasted.components.media.muted).toBe(true)
    })

    it('does not hand sound settings to types that have none', () => {
        expect(createEntityOfType('box').components.media).toBeUndefined()
        expect(createEntityOfType('image').components.media.spatial).toBeUndefined()
    })

    it('still produces a normalized entity with an id and transform', () => {
        const entity = createEntityOfType('video')
        expect(entity.id).toBeTruthy()
        expect(entity.components.transform.position).toEqual([0, 0, 0])
    })
})
