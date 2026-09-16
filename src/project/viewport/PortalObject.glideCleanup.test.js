import { describe, it, expect, vi } from 'vitest'
import { withGlideCleanup } from './PortalObject.jsx'

// The camera-freeze bug this guards: EntryGlideCamera stays mounted (and its
// priority-1 useFrame keeps pinning the camera + rendering every frame) for
// as long as PortalObject's `glide` state is non-null. The only place that
// state is set is `enter()`; nothing ever set it back to null after the
// glide's promise resolved, so the camera locked at the glide's stop position
// forever, unresponsive to the walker/orbit controls underneath it — see
// docs/ai/known-fixes.md.
describe('withGlideCleanup', () => {
    it('resolves the glide promise AND clears the glide state that keeps EntryGlideCamera mounted', () => {
        const resolve = vi.fn()
        const clear = vi.fn()
        const wrapped = withGlideCleanup(resolve, clear)

        const frame = { fake: 'captured-frame' }
        wrapped(frame)

        expect(resolve).toHaveBeenCalledTimes(1)
        expect(resolve).toHaveBeenCalledWith(frame)
        expect(clear).toHaveBeenCalledTimes(1)
    })

    it('clears even when the glide resolves with null (reach < 1, no frame captured)', () => {
        const resolve = vi.fn()
        const clear = vi.fn()
        withGlideCleanup(resolve, clear)(null)

        expect(resolve).toHaveBeenCalledWith(null)
        expect(clear).toHaveBeenCalledTimes(1)
    })
})
