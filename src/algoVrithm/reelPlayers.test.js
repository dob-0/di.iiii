import { describe, it, expect, beforeEach, vi } from 'vitest'

// The pool and the unlock flag are MODULE state, deliberately — one pool per
// page for the life of the page. Every test therefore needs a fresh copy of the
// module rather than a reset function the runtime would never call.
const freshModule = () => {
    vi.resetModules()
    return import('./reelPlayers.js')
}

const gesture = () => window.dispatchEvent(new Event('pointerdown'))

// The unlock tests are about ORDER, not pool size, and every player is a real
// <video> with a src jsdom will try to load. Three is enough to prove the rule
// and keeps the file fast.
const FEW = 3

describe('reelPlayers audio unlock', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    // THE REGRESSION. The warm-up is deferred to requestIdleCallback, so the
    // pool routinely does not exist yet when the visitor's first tap lands —
    // in a headset that tap is Enter VR, arriving seconds before idle. The old
    // unlock() unmuted `sharedPlayers?.` and set the flag, so a pool built
    // afterwards stayed muted for the life of the page with nothing left to
    // unmute it. Symptom: the synth score plays, the reels are silent.
    it('unmutes a pool that is built AFTER the unlocking gesture', async () => {
        const { armAudioUnlock, reelPlayers, isAudioUnlocked } = await freshModule()

        armAudioUnlock()
        gesture()
        expect(isAudioUnlocked()).toBe(true)

        const players = reelPlayers(FEW)
        expect(players.length).toBeGreaterThan(0)
        expect(players.every((player) => player.video.muted === false)).toBe(true)
    })

    it('unmutes a pool that already existed when the gesture landed', async () => {
        const { armAudioUnlock, reelPlayers } = await freshModule()

        const players = reelPlayers(FEW)
        expect(players.every((player) => player.video.muted === true)).toBe(true)

        armAudioUnlock()
        gesture()
        expect(players.every((player) => player.video.muted === false)).toBe(true)
    })

    // The correct failure, and it must stay the failure: an unmuted video
    // cannot autoplay without a gesture, so a piece nobody has touched plays
    // silent rather than not playing at all.
    it('leaves the pool muted when no gesture ever happens', async () => {
        const { reelPlayers, isAudioUnlocked } = await freshModule()

        const players = reelPlayers(FEW)
        expect(isAudioUnlocked()).toBe(false)
        expect(players.every((player) => player.video.muted === true)).toBe(true)
    })

    it('hands out one shared pool rather than building per caller', async () => {
        const { reelPlayers } = await freshModule()
        expect(reelPlayers(FEW)).toBe(reelPlayers(FEW))
    })
})

describe('reelPlayers decoder ceiling', () => {
    // A standalone headset cannot allocate a decoder per clip, and the failure
    // is silent — the element never produces a frame and its cells draw black,
    // which reads as holes in the globe rather than as a decoding limit.
    it('caps the pool at the headset ceiling when asked for one', async () => {
        const { reelPlayers, HEADSET_MAX_PLAYERS } = await freshModule()
        expect(reelPlayers(HEADSET_MAX_PLAYERS).length).toBe(HEADSET_MAX_PLAYERS)
    })

    it('keeps the whole folder under the desktop ceiling', async () => {
        const { reelPlayers, playerCount, DESKTOP_MAX_PLAYERS } = await freshModule()
        expect(reelPlayers().length).toBe(playerCount(DESKTOP_MAX_PLAYERS))
        expect(reelPlayers().length).toBeGreaterThan(9)
    })

    // The ceiling is a decision made once, by the warm-up. A later caller
    // asking for a different size must not silently rebuild the pool — every
    // <video> element and its decoder would be replaced mid-piece.
    it('ignores a later caller asking for a different ceiling', async () => {
        const { reelPlayers, HEADSET_MAX_PLAYERS } = await freshModule()
        const first = reelPlayers(HEADSET_MAX_PLAYERS)
        expect(reelPlayers()).toBe(first)
        expect(reelPlayers().length).toBe(HEADSET_MAX_PLAYERS)
    })

    it('never asks for more clips than the folder holds', async () => {
        const { playerCount } = await freshModule()
        expect(playerCount(1000)).toBe(playerCount(1000))
        expect(playerCount(1000)).toBeLessThanOrEqual(1000)
        expect(playerCount(3)).toBe(3)
    })
})
