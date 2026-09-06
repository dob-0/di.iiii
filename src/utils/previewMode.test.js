import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPreviewRequest, PREVIEW_READY_MESSAGE, signalPreviewReady, watchPreviewPaint } from './previewMode.js'

const originalSearch = window.location.search

const setSearch = (search) => {
    window.history.replaceState({}, '', `${window.location.pathname}${search}`)
}

afterEach(() => {
    setSearch(originalSearch)
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

describe('isPreviewRequest', () => {
    it('reads ?preview=1 from the given search or the location', () => {
        expect(isPreviewRequest('?preview=1')).toBe(true)
        expect(isPreviewRequest('?preview=0')).toBe(false)
        expect(isPreviewRequest('')).toBe(false)
        setSearch('?preview=1')
        expect(isPreviewRequest()).toBe(true)
    })
})

describe('signalPreviewReady', () => {
    it('posts to the parent with the page’s own origin', () => {
        const postMessage = vi.fn()
        const win = { parent: { postMessage }, location: window.location }
        // the real window is its own parent in jsdom, so drive the guard directly
        expect(signalPreviewReady('showroom')).toBe(false)

        vi.spyOn(window, 'parent', 'get').mockReturnValue(win.parent)
        expect(signalPreviewReady('showroom')).toBe(true)
        expect(postMessage).toHaveBeenCalledWith(
            { type: PREVIEW_READY_MESSAGE, spaceId: 'showroom' },
            window.location.origin
        )
    })
})

describe('watchPreviewPaint', () => {
    const runFrames = async (count = 6) => {
        for (let i = 0; i < count; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0))
        }
    }

    it('waits for the loading screen to go and a drawn surface to appear', async () => {
        setSearch('?preview=1')
        const postMessage = vi.fn()
        vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage })
        // jsdom has no rAF worth driving here; the watcher falls back to timeouts
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => window.setTimeout(() => fn(), 0))

        document.body.innerHTML = '<div class="loading-screen"></div>'
        const stop = watchPreviewPaint({ spaceId: 'showroom' })

        await runFrames()
        // still black: the loading screen is up and nothing has drawn
        expect(postMessage).not.toHaveBeenCalled()

        document.body.innerHTML = '<canvas></canvas>'
        await runFrames()
        expect(postMessage).toHaveBeenCalledWith(
            { type: PREVIEW_READY_MESSAGE, spaceId: 'showroom' },
            window.location.origin
        )
        expect(postMessage).toHaveBeenCalledTimes(1)
        stop()
    })

    it('says nothing when the page was not opened as a preview', async () => {
        setSearch('')
        const postMessage = vi.fn()
        vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage })
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => window.setTimeout(() => fn(), 0))

        document.body.innerHTML = '<canvas></canvas>'
        watchPreviewPaint({ spaceId: 'showroom' })

        await runFrames()
        expect(postMessage).not.toHaveBeenCalled()
    })
})
