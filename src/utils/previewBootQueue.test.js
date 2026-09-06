import { describe, expect, it, vi } from 'vitest'
import { createPreviewBootQueue, PREVIEW_BOOT_SLOTS } from './previewBootQueue.js'

describe('createPreviewBootQueue', () => {
    it('starts only as many as it has slots and hands the next one on release', () => {
        const requestBoot = createPreviewBootQueue(2)
        const starts = [vi.fn(), vi.fn(), vi.fn()]
        const releases = starts.map((start) => requestBoot(start))

        expect(starts.map((s) => s.mock.calls.length)).toEqual([1, 1, 0])

        releases[0]()
        expect(starts[2]).toHaveBeenCalledTimes(1)
    })

    it('releasing twice does not open a second slot', () => {
        const requestBoot = createPreviewBootQueue(1)
        const starts = [vi.fn(), vi.fn(), vi.fn()]
        const releases = starts.map((start) => requestBoot(start))

        releases[0]()
        releases[0]()
        expect(starts[1]).toHaveBeenCalledTimes(1)
        expect(starts[2]).not.toHaveBeenCalled()
    })

    it('a waiter that leaves before it ever started gives up its place, not somebody else’s slot', () => {
        const requestBoot = createPreviewBootQueue(1)
        const starts = [vi.fn(), vi.fn(), vi.fn()]
        const releases = starts.map((start) => requestBoot(start))

        // the second card scrolled out of view while still queued
        releases[1]()
        expect(starts[1]).not.toHaveBeenCalled()
        expect(starts[2]).not.toHaveBeenCalled()

        releases[0]()
        expect(starts[2]).toHaveBeenCalledTimes(1)
    })

    it('keeps the tight default for the projection mapper', () => {
        expect(PREVIEW_BOOT_SLOTS).toBe(2)
    })
})
