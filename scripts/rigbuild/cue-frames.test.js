import { describe, expect, it } from 'vitest'
import { frameName, shotPlan, unpatched, withCamera } from './cue-frames.mjs'

const list = [
    { name: 'one beam', lookId: 'rig-one-beam', fade: 2, hold: 10 },
    { name: 'strobe hit', lookId: 'rig-strobe-hit', fade: 0, hold: 4 },
]

describe('cue-frames.mjs', () => {
    it('shoots a cue after its fade has landed and not before half its hold', () => {
        // cue 0 fired at t=0 (nextAt 10 000): fade 2 s + 1.5 s = 3.5 s < hold/2 = 5 s → shoot at 5 s
        expect(shotPlan({ index: 0, nextAt: 10_000, list }, new Set(), 1_000)).toEqual({ shoot: 0, cue: list[0], wait: 4_000 })
        // past the shot time: shoot now
        expect(shotPlan({ index: 0, nextAt: 10_000, list }, new Set(), 6_000).wait).toBe(0)
        // short snap cue: fade 0 + 1.5 s > hold/2 = 2 s? no — 1.5 < 2, so half the hold wins
        expect(shotPlan({ index: 1, nextAt: 4_000, list }, new Set(), 0)).toMatchObject({ shoot: 1, wait: 2_000 })
    })
    it('waits out a cue already shot, or one about to end', () => {
        expect(shotPlan({ index: 0, nextAt: 10_000, list }, new Set([0]), 2_000)).toEqual({ wait: 8_300 })
        expect(shotPlan({ index: 0, nextAt: 10_000, list }, new Set(), 9_800)).toEqual({ wait: 500 })
    })
    it('sets the camera in the browser copy only, keeping the rest of the presentation', () => {
        const doc = withCamera({ presentationState: { other: 1 } }, { position: [0, 1.7, 15], target: [0, 4, 0], fov: 50 })
        expect(doc.presentationState).toMatchObject({ other: 1, mode: 'fixed-camera', entryView: 'fixed-camera' })
        expect(doc.presentationState.fixedCamera).toMatchObject({ position: [0, 1.7, 15], target: [0, 4, 0], fov: 50 })
        expect(doc.worldState.savedView).toMatchObject({ mode: 'perspective', fov: 50 })
    })
    it('drops a saved rig’s DMX addresses without touching the saved copy', () => {
        const saved = { document: { entities: [{ components: { fixture: { universe: 2, address: 17, type: 'x' } } }, { components: {} }] } }
        const doc = unpatched(saved)
        expect(doc.entities[0].components.fixture).toEqual({ type: 'x' })
        expect(saved.document.entities[0].components.fixture.address).toBe(17)
    })
    it('names frames tag-camera-n-look', () => {
        expect(frameName('cut', 'dj-up', 3, 'rig-white-cathedral')).toBe('cut-dj-up-4-white-cathedral.png')
    })
})
