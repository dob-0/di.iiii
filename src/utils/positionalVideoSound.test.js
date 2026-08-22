import { describe, it, expect } from 'vitest'
import { attachPositionalVideoSound, keepListenerAwake, DEFAULT_REF_DISTANCE, DEFAULT_MAX_DISTANCE } from './positionalVideoSound.js'
import { __resetAudioWake } from './audioWake.js'

// jsdom has no Web Audio, so the panner itself is exercised in a real browser
// (see the falloff measurement in docs/ai/known-fixes.md). What is worth
// pinning here is the refusal path: every one of these must return null and
// leave the caller's flat audio alone rather than throwing into a render.
describe('attachPositionalVideoSound guards', () => {
    const target = { add: () => {} }
    const video = {}
    const listener = { context: {} }

    it('refuses without a target, video, or listener', () => {
        expect(attachPositionalVideoSound(null, video, listener)).toBeNull()
        expect(attachPositionalVideoSound(target, null, listener)).toBeNull()
        expect(attachPositionalVideoSound(target, video, null)).toBeNull()
    })

    it('returns null rather than throwing when Web Audio is unavailable', () => {
        // A listener with no usable context is what a browser without the API
        // (or a suspended/closed one) looks like from here.
        expect(() => attachPositionalVideoSound(target, video, listener)).not.toThrow()
        expect(attachPositionalVideoSound(target, video, listener)).toBeNull()
    })

    // The whole point of routing this through audioWake rather than a one-shot
    // listener: a context suspended later (headset session start, tab wake) must
    // still have something left that can resume it.
    it('keeps waking a context that falls asleep again, and unregisters cleanly', () => {
        __resetAudioWake()
        let resumes = 0
        const context = {
            state: 'suspended',
            resume: () => { resumes += 1 },
            addEventListener: () => {}
        }
        const stop = keepListenerAwake({ context })
        expect(resumes).toBe(1)
        window.dispatchEvent(new Event('pointerdown'))
        expect(resumes).toBe(2)
        stop()
        window.dispatchEvent(new Event('pointerdown'))
        expect(resumes).toBe(2)
    })

    it('tolerates a listener with no context at all', () => {
        expect(() => keepListenerAwake(null)()).not.toThrow()
    })

    it('exposes sane defaults for the distance model', () => {
        expect(DEFAULT_REF_DISTANCE).toBeGreaterThan(0)
        expect(DEFAULT_MAX_DISTANCE).toBeGreaterThan(DEFAULT_REF_DISTANCE)
    })
})
