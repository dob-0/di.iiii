import { describe, it, expect, beforeEach, vi } from 'vitest'
import { keepAudioAwake, resumeAudio, __resetAudioWake } from './audioWake.js'

// A stand-in for an AudioContext that records resume() calls and can be driven
// between states, so the tests can assert the thing that actually matters:
// that a context suspended AFTER the first gesture still gets woken up.
const makeContext = (state = 'suspended') => {
    const listeners = {}
    return {
        state,
        resume: vi.fn(function resume() {
            this.state = 'running'
            return Promise.resolve()
        }),
        addEventListener: (name, handler) => {
            listeners[name] = listeners[name] || []
            listeners[name].push(handler)
        },
        // Test-side helper: move the context and fire statechange like the real
        // implementation does.
        __setState(next) {
            this.state = next
            ;(listeners.statechange || []).forEach((handler) => handler())
        },
    }
}

beforeEach(() => {
    __resetAudioWake()
})

describe('audioWake', () => {
    it('resumes a suspended context as soon as it is registered', () => {
        const context = makeContext('suspended')
        keepAudioAwake(context)
        expect(context.resume).toHaveBeenCalledTimes(1)
        expect(context.state).toBe('running')
    })

    it('leaves a running context alone', () => {
        const context = makeContext('running')
        keepAudioAwake(context)
        expect(context.resume).not.toHaveBeenCalled()
    })

    // THE REGRESSION. The piece went silent — score and reels together —
    // because the one-shot gesture unlock had already fired, so a context
    // suspended later (headset switching audio device on sessionstart, tab
    // backgrounded) had nothing left that would ever resume it.
    it('resumes a context that falls asleep AFTER it was first woken', () => {
        const context = makeContext('suspended')
        keepAudioAwake(context)
        expect(context.state).toBe('running')

        // The session starts and the device switch suspends it.
        context.__setState('suspended')

        // The statechange watch must have brought it straight back.
        expect(context.resume).toHaveBeenCalledTimes(2)
        expect(context.state).toBe('running')
    })

    it('resumeAudio() wakes every registered context', () => {
        const score = makeContext('suspended')
        const reels = makeContext('suspended')
        keepAudioAwake(score)
        keepAudioAwake(reels)
        score.__setState('suspended')
        reels.__setState('suspended')
        score.resume.mockClear()
        reels.resume.mockClear()
        score.state = 'suspended'
        reels.state = 'suspended'

        resumeAudio()

        expect(score.resume).toHaveBeenCalled()
        expect(reels.resume).toHaveBeenCalled()
    })

    it('a gesture on window wakes a sleeping context', () => {
        const context = makeContext('suspended')
        keepAudioAwake(context)
        context.resume.mockClear()
        context.state = 'suspended'

        window.dispatchEvent(new Event('pointerdown'))

        expect(context.resume).toHaveBeenCalled()
    })

    it('unregisters, so a torn-down listener is not kept alive', () => {
        const context = makeContext('suspended')
        const stop = keepAudioAwake(context)
        stop()
        context.resume.mockClear()
        context.state = 'suspended'

        resumeAudio()

        expect(context.resume).not.toHaveBeenCalled()
    })

    it('watches a context only once, however many times it is registered', () => {
        const context = makeContext('suspended')
        keepAudioAwake(context)
        keepAudioAwake(context)
        keepAudioAwake(context)
        context.resume.mockClear()

        // One statechange must produce exactly one resume, not three — the
        // context outlives every component, so remounts must not stack watches.
        context.__setState('suspended')

        expect(context.resume).toHaveBeenCalledTimes(1)
    })

    it('survives a resume() the browser refuses', () => {
        const context = makeContext('suspended')
        context.resume = vi.fn(() => Promise.reject(new Error('no user activation')))
        expect(() => keepAudioAwake(context)).not.toThrow()
    })

    it('is safe with no context at all', () => {
        expect(() => keepAudioAwake(null)()).not.toThrow()
    })
})
