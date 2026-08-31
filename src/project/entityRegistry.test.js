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

    // The author stamp. It is handed in, never looked up: this funnel stays a
    // pure function, so the clipboard and these tests can call it with no
    // session anywhere in reach.
    it('stamps the author the caller hands it', () => {
        const entity = createEntityOfType('box', { createdBy: { subject: 'guest:ani', label: 'Ani' } })
        expect(entity.createdBy).toEqual({ subject: 'guest:ani', label: 'Ani' })
    })

    it('leaves an entity unowned when the caller has no author to give', () => {
        expect(createEntityOfType('box').createdBy).toBeNull()
        expect(createEntityOfType('box', { createdBy: { label: 'Ani' } }).createdBy).toBeNull()
    })
})
