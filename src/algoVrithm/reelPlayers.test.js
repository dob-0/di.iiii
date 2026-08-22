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
    it('caps the pool at whatever ceiling it is handed', async () => {
        const { reelPlayers } = await freshModule()
        expect(reelPlayers(4).length).toBe(4)
    })

    // The ceiling stopped being a constant when the reels were re-encoded: nine
    // was chosen for 1080x1920 sources and would now be throwing away two
    // thirds of the folder to pay a cost that is no longer there.
    it('spends the budget on the resolution the folder actually is', async () => {
        const { headsetCeiling, HEADSET_PIXEL_BUDGET, DESKTOP_MAX_PLAYERS } = await freshModule()

        // The old full-resolution captures: the budget IS nine of them.
        expect(headsetCeiling(1080 * 1920)).toBe(9)
        // Today's 360x640 — cheap enough that the folder's own size is the limit.
        expect(headsetCeiling(360 * 640)).toBe(DESKTOP_MAX_PLAYERS)
        // Twice the budget in one frame still leaves a globe, not nothing.
        expect(headsetCeiling(HEADSET_PIXEL_BUDGET * 2)).toBe(1)
    })

    // A probe that cannot answer must not be read as "a frame costs nothing".
    it('falls back to the old fixed ceiling when the source will not say', async () => {
        const { headsetCeiling, HEADSET_FALLBACK_PLAYERS } = await freshModule()
        expect(headsetCeiling(null)).toBe(HEADSET_FALLBACK_PLAYERS)
        expect(headsetCeiling(0)).toBe(HEADSET_FALLBACK_PLAYERS)
        expect(headsetCeiling(NaN)).toBe(HEADSET_FALLBACK_PLAYERS)
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
        const { reelPlayers } = await freshModule()
        const first = reelPlayers(4)
        expect(reelPlayers()).toBe(first)
        expect(reelPlayers().length).toBe(4)
    })

    it('never asks for more clips than the folder holds', async () => {
        const { playerCount } = await freshModule()
        expect(playerCount(1000)).toBe(playerCount(1000))
        expect(playerCount(1000)).toBeLessThanOrEqual(1000)
        expect(playerCount(3)).toBe(3)
    })
})

// A ceiling is a prediction about hardware this repo cannot run every variant
// of. When it is wrong, the globe must show a repeat rather than a hole.
describe('a pool that heals instead of going black', () => {
    const player = (id, { readyState = 4, width = 360, height = 640 } = {}) => ({
        texture: `texture-${id}`,
        video: { readyState, videoWidth: width, videoHeight: height }
    })

    it('reads a player that never produced a frame as dead, however it failed', async () => {
        const { hasPicture } = await freshModule()
        expect(hasPicture(player('a'))).toBe(true)
        expect(hasPicture(player('b', { readyState: 0 }))).toBe(false)
        expect(hasPicture(player('c', { width: 0 }))).toBe(false)
        expect(hasPicture(undefined)).toBe(false)
    })

    // MEASURED, not reasoned about: polling readyState alone reported three of
    // thirty-one dead mid-beat on a desktop where every clip was decoding —
    // each player seeks to a random point in its own timeline and readyState
    // drops for the length of the seek, while the texture keeps showing its
    // last frame. Substituting there would flicker the wrong clip into a cell
    // that was never black.
    it('does not call a seeking player dead once it has shown a frame', async () => {
        const { hasPicture, displayTextures } = await freshModule()
        const pool = [player('a'), player('b'), player('c')]
        expect(hasPicture(pool[1])).toBe(true)

        pool[1].video.readyState = 1 // mid-seek
        expect(hasPicture(pool[1])).toBe(true)
        expect(displayTextures(pool)).toEqual(['texture-a', 'texture-b', 'texture-c'])
    })

    it('leaves a healthy pool exactly as it is', async () => {
        const { displayTextures } = await freshModule()
        const pool = [player('a'), player('b'), player('c')]
        expect(displayTextures(pool)).toEqual(['texture-a', 'texture-b', 'texture-c'])
    })

    it('shows a live clip in place of a dead one', async () => {
        const { displayTextures } = await freshModule()
        const pool = [player('a'), player('b', { readyState: 0 }), player('c')]
        expect(displayTextures(pool)).toEqual(['texture-a', 'texture-a', 'texture-c'])
    })

    // Every dead cell falling back to the SAME clip would trade a hole for a
    // wall of one reel, which is the "one by one" the mix exists to avoid.
    it('spreads the substitutes across the live players', async () => {
        const { displayTextures } = await freshModule()
        const pool = [
            player('a'),
            player('b', { readyState: 0 }),
            player('c', { readyState: 0 }),
            player('d')
        ]
        expect(displayTextures(pool)).toEqual(['texture-a', 'texture-a', 'texture-d', 'texture-d'])
    })

    // A pool nobody has loaded YET is every player dead, and rewriting it into
    // one frozen clip would be worse than waiting a moment for the real thing.
    it('changes nothing while the whole pool is still loading', async () => {
        const { displayTextures } = await freshModule()
        const pool = [player('a', { readyState: 0 }), player('b', { readyState: 0 })]
        expect(displayTextures(pool)).toEqual(['texture-a', 'texture-b'])
    })

    it('signs the health so a watcher only works when it changes', async () => {
        const { healthSignature } = await freshModule()
        const pool = [player('a'), player('b', { readyState: 0 })]
        expect(healthSignature(pool)).toBe('10')
        pool[1].video.readyState = 4
        expect(healthSignature(pool)).toBe('11')
    })
})
