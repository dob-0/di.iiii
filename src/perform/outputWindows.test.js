import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
    createOutputController, featuresForScreen, matchScreenOps, pickScreen, resolveScreen, screenChoices, matchTarget, withOutputWindow, POLL_MS, loadScreens
} from './outputWindows.js'
import { answerPresence } from '../map/outputPresence.js'

// A channel pair: everything posted on one name reaches every OTHER channel of that name.
const makeBus = () => {
    const all = []
    return (name) => {
        const channel = { name, onmessage: null, postMessage(data) { all.filter((c) => c !== channel && c.name === name).forEach((c) => c.onmessage?.({ data })) }, close() { all.splice(all.indexOf(channel), 1) } }
        all.push(channel)
        return channel
    }
}
const fakeWin = () => ({ closed: false, opener: {}, close: vi.fn(function close() { this.closed = true }) })

describe('output controller', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('opens by the named window and closes with win.close()', () => {
        const win = fakeWin()
        const open = vi.fn(() => win)
        const c = createOutputController({ spaceId: 's', projectId: 'p', open, createChannel: makeBus() })
        expect(c.getState().open).toBe(false)
        c.open({ features: 'left=1' })
        expect(open).toHaveBeenCalledWith('/s/map/p/out', 'di-map-out-p', 'left=1')
        expect(win.opener).toBe(null)
        expect(c.getState()).toMatchObject({ open: true, via: 'handle' })
        c.close()
        expect(win.close).toHaveBeenCalledTimes(1)
        expect(c.getState().open).toBe(false)
        c.destroy()
    })

    it('notices a window closed by hand', () => {
        const win = fakeWin()
        const c = createOutputController({ spaceId: 's', projectId: 'p', open: () => win, createChannel: makeBus() })
        c.open()
        win.closed = true
        vi.advanceTimersByTime(POLL_MS + 1)
        expect(c.getState().open).toBe(false)
        c.destroy()
    })

    it('says blocked when the browser refuses the window', () => {
        const c = createOutputController({ spaceId: 's', projectId: 'p', open: () => null, createChannel: makeBus() })
        c.open()
        expect(c.getState()).toMatchObject({ open: false, blocked: true })
        c.destroy()
    })

    it('recovers an open output page after a reload by ping, and shows closed when none answers', () => {
        const bus = makeBus()
        const page = bus('di-map-out-presence-p')
        page.onmessage = (event) => answerPresence(event.data, { post: (m) => page.postMessage(m), close: () => {} })
        const c = createOutputController({ spaceId: 's', projectId: 'p', createChannel: bus })
        c.recover()
        expect(c.getState()).toMatchObject({ open: true, via: 'ping' })
        c.destroy()
        page.close()

        const lonely = createOutputController({ spaceId: 's', projectId: 'p', createChannel: makeBus() })
        lonely.recover()
        vi.advanceTimersByTime(1000)
        expect(lonely.getState().open).toBe(false)
        lonely.destroy()
    })

    it('a recovered window that goes quiet or says bye reads closed; close asks the page', () => {
        const bus = makeBus()
        const page = bus('di-map-out-presence-p')
        const close = vi.fn()
        let alive = true
        page.onmessage = (event) => { if (alive) answerPresence(event.data, { post: (m) => page.postMessage(m), close }) }
        const c = createOutputController({ spaceId: 's', projectId: 'p', createChannel: bus })
        c.recover()
        c.close()
        expect(close).toHaveBeenCalledTimes(1)
        expect(c.getState().open).toBe(false)
        c.destroy()

        const c2 = createOutputController({ spaceId: 's', projectId: 'p', createChannel: bus })
        c2.recover()
        expect(c2.getState().open).toBe(true)
        alive = false
        vi.advanceTimersByTime(POLL_MS * 5)
        expect(c2.getState().open).toBe(false)
        c2.destroy()
    })
})

describe('screens and size', () => {
    const screens = [
        { index: 0, label: 'Laptop', width: 1440, height: 900, left: 0, top: 0 },
        { index: 1, label: 'Projector', width: 1920, height: 1080, left: 1440, top: 0 }
    ]
    it('picks by label, then index, then size', () => {
        expect(pickScreen(screens, { label: 'Projector', index: 0, size: null })).toBe(screens[0])
        expect(pickScreen(screens, { label: 'Projector', index: 9, size: null })).toBe(screens[1])
        expect(pickScreen(screens, { label: 'gone', index: 0 })).toBe(screens[0])
        expect(pickScreen(screens, { label: '', index: null, size: [1920, 1080] })).toBe(screens[1])
        expect(pickScreen(screens, null)).toBe(null)
    })
    it('shows the saved pick even before the screens are listed, and offers the picked size', () => {
        const saved = { label: 'Screen 3', index: 2, size: [1281, 720] }
        const only = [{ index: 0, label: 'Screen 1', width: 1707, height: 960, left: 0, top: 0 }]
        expect(resolveScreen(only, saved)).toMatchObject({ index: 2, label: 'Screen 3', width: 1281, height: 720, saved: true })
        expect(screenChoices(only, saved).map((s) => s.index)).toEqual([0, 2])
        expect(screenChoices(screens, { index: 1 })).toBe(screens)
        expect(matchTarget(only, saved)).toEqual([1281, 720])
        expect(matchTarget(only, null)).toEqual([1707, 960])
        expect(matchTarget(screens, { index: 1 })).toEqual([1920, 1080])
        expect(resolveScreen(only, null)).toBe(null)
    })
    it('puts the window on the chosen screen', () => {
        expect(featuresForScreen(screens[1])).toBe('popup=yes,left=1440,top=0,width=1920,height=1080')
        expect(featuresForScreen(null)).toBe('')
        // a screen with a panel: the window stays inside the usable area its left/top come from
        expect(featuresForScreen({ left: 0, top: 32, width: 1920, height: 1080, availWidth: 1920, availHeight: 1048 })).toBe('popup=yes,left=0,top=32,width=1920,height=1048')
    })
    it('match the screen writes the output size AND every surface resolution', () => {
        const mapping = { output: { width: 1920, height: 1080, slate: 'off' }, surfaces: [{ id: 'a', resolution: [1280, 720] }, { id: 'b', resolution: [1280, 720] }] }
        const ops = matchScreenOps(mapping, [3840, 2160])
        expect(ops[0]).toEqual({ type: 'setMappingState', payload: { patch: { output: { width: 3840, height: 2160, slate: 'off' } } } })
        expect(ops.slice(1)).toEqual([
            { type: 'setMappingSurface', payload: { surfaceId: 'a', patch: { resolution: [3840, 2160] } } },
            { type: 'setMappingSurface', payload: { surfaceId: 'b', patch: { resolution: [3840, 2160] } } }
        ])
    })
    it('window settings keep the rest of output and drop empty ones', () => {
        expect(withOutputWindow({ width: 1, height: 2 }, { fullscreen: true })).toEqual({ width: 1, height: 2, window: { fullscreen: true } })
        expect(withOutputWindow({ width: 1, height: 2, window: { fullscreen: true } }, { fullscreen: false })).toEqual({ width: 1, height: 2 })
    })
    it('says plainly when the browser cannot place a window', async () => {
        const got = await loadScreens({ screen: { width: 1920, height: 1080 } })
        expect(got.reason).toMatch(/cannot place a window on a screen/)
        expect(got.screens).toHaveLength(1)
    })
})
