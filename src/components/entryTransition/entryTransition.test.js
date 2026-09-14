import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAppNavigate } from '../../utils/appNavigate.js'
import { __resetEntryForTests, carryReviewParams, enterDestination, enterFromElement, isEntryInProgress, pictureOfPage, registerFrameSource } from './entryTransition.js'

// jsdom has no Web Animations, so every eased move resolves at once here —
// what these tests hold is the ORDER: nothing navigates before the cover is
// up, the curtain stays until the destination paints, and then it is gone.

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
    __resetEntryForTests()
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 1))
    window.requestAnimationFrame = globalThis.requestAnimationFrame
    document.body.innerHTML = '<div id="root"></div>'
})

afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

const curtain = () => document.querySelector('.dii-entry-curtain')

// The destination "paints" the moment the router renders it.
const paintingNavigate = () => vi.fn(() => {
    document.getElementById('root').appendChild(document.createElement('canvas'))
})

describe('enterDestination', () => {
    it('holds a curtain over the page until the destination has painted, then removes it', async () => {
        const navigate = paintingNavigate()
        const entering = enterDestination('/br_id_ge', { navigate, reducedMotion: false })
        expect(curtain()).toBeTruthy()
        expect(isEntryInProgress()).toBe(true)
        expect(await entering).toBe('entered')
        expect(navigate).toHaveBeenCalledWith('/br_id_ge')
        expect(curtain()).toBeNull()
        expect(isEntryInProgress()).toBe(false)
    })

    // The black gap: the old page was torn down before the new one had a
    // frame. The curtain must already be on screen when the route changes.
    it('never navigates before the curtain is up', async () => {
        let curtainAtNavigation = null
        const navigate = vi.fn(() => {
            curtainAtNavigation = curtain()
            document.getElementById('root').appendChild(document.createElement('canvas'))
        })
        await enterDestination('/wcc', { navigate, reducedMotion: false })
        expect(curtainAtNavigation).toBeTruthy()
    })

    it('holds the room\'s last glide frame', async () => {
        const frame = document.createElement('canvas')
        let heldAtNavigation = false
        const navigate = vi.fn(() => {
            heldAtNavigation = curtain()?.contains(frame)
            document.getElementById('root').appendChild(document.createElement('canvas'))
        })
        const glide = vi.fn(() => Promise.resolve(frame))
        await enterDestination('/beyond-form', { navigate, reducedMotion: false, source: { glide, color: '#ffffff' } })
        expect(glide).toHaveBeenCalledWith(expect.any(Number), { reach: 1 })
        expect(heldAtNavigation).toBe(true)
    })

    it('does not fly a visitor who asked for reduced motion', async () => {
        const glide = vi.fn(() => Promise.resolve(null))
        const capture = vi.fn(() => document.createElement('canvas'))
        await enterDestination('/wcc', { navigate: paintingNavigate(), reducedMotion: true, source: { glide, capture } })
        expect(glide).not.toHaveBeenCalled()
        expect(capture).toHaveBeenCalled()
    })

    it('ignores a second door pressed while the first is opening', async () => {
        const navigate = paintingNavigate()
        const first = enterDestination('/a', { navigate, reducedMotion: false })
        expect(await enterDestination('/b', { navigate, reducedMotion: false })).toBe('busy')
        await first
        expect(navigate).toHaveBeenCalledTimes(1)
        expect(navigate).toHaveBeenCalledWith('/a')
    })

    it('hides the room controls for the move and gives them back', async () => {
        let during = false
        const navigate = vi.fn(() => {
            during = document.body.classList.contains('dii-entering')
            document.getElementById('root').appendChild(document.createElement('canvas'))
        })
        await enterDestination('/a', { navigate, reducedMotion: false })
        expect(during).toBe(true)
        expect(document.body.classList.contains('dii-entering')).toBe(false)
    })

    it('does nothing for a door that leads nowhere', async () => {
        const navigate = vi.fn()
        expect(await enterDestination(null, { navigate })).toBe('no-destination')
        expect(navigate).not.toHaveBeenCalled()
        await flush()
        expect(curtain()).toBeNull()
    })
})

describe('carryReviewParams', () => {
    it('carries ?entryslow through the door and nothing else', () => {
        expect(carryReviewParams('/wcc', '?entryslow=4&tour=1')).toBe('/wcc?entryslow=4')
        expect(carryReviewParams('/a/b?x=1', '?entryslow=6')).toBe('/a/b?x=1&entryslow=6')
        // The variant switch is gone; an old review link does not carry it on.
        expect(carryReviewParams('/wcc', '?entry=b&tour=1')).toBe('/wcc')
    })
})

// A front-page button: the page is the door, so the page itself is what the
// curtain holds while the router tears it down underneath.
describe('holding the page through a door with no room behind it', () => {
    const buildPage = () => {
        const root = document.getElementById('root')
        root.innerHTML = `
            <div class="lp-root" id="landing-scroller" style="height:100px;overflow:auto">
                <canvas class="live-scene-canvas" width="4" height="4"></canvas>
                <iframe class="preview" src="about:blank"></iframe>
                <video class="clip"></video>
                <a class="MuiButton-root" href="/wcc">WCC Exhibition<span class="MuiTouchRipple-root"><span class="ripple"></span></span></a>
            </div>`
        return root
    }

    it('copies the page into the curtain before the route changes, and keeps it there until the destination paints', async () => {
        buildPage()
        let heldAtNavigation = null
        const navigate = vi.fn(() => {
            heldAtNavigation = curtain()?.querySelector('.dii-entry-held a')?.textContent || null
            // The router unmounts the page and mounts the destination.
            const root = document.getElementById('root')
            root.innerHTML = ''
            root.appendChild(document.createElement('canvas'))
        })
        const result = await enterDestination('/wcc', {
            navigate,
            reducedMotion: false,
            source: { hold: () => pictureOfPage(document), rect: { left: 10, top: 10, width: 100, height: 30 } }
        })
        expect(result).toBe('entered')
        expect(heldAtNavigation).toBe('WCC Exhibition')
        expect(curtain()).toBeNull()
    })

    // The destination may be ready at once (a cached chunk). The push must
    // still run long enough to read as a move and not as a flicker.
    it('does not let the destination up before the push has had its lead', async () => {
        buildPage()
        const started = performance.now()
        await enterDestination('/wcc', {
            navigate: paintingNavigate(),
            reducedMotion: false,
            source: { hold: () => pictureOfPage(document) }
        })
        expect(performance.now() - started).toBeGreaterThanOrEqual(480)
    })

    it('holds the page for a reduced-motion visitor too, with no lead', async () => {
        buildPage()
        let held = false
        const navigate = vi.fn(() => {
            held = Boolean(curtain()?.querySelector('.dii-entry-held'))
            document.getElementById('root').appendChild(document.createElement('canvas'))
        })
        const started = performance.now()
        await enterDestination('/spaces', { navigate, reducedMotion: true, source: { hold: () => pictureOfPage(document) } })
        expect(held).toBe(true)
        expect(performance.now() - started).toBeLessThan(400)
    })

    it('draws what a copy of the DOM cannot carry: a canvas as its current frame, frames and videos as empty boxes', () => {
        const root = buildPage()
        const liveCanvas = root.querySelector('canvas')
        const frame = document.createElement('canvas')
        frame.dataset.frame = 'room'
        registerFrameSource(liveCanvas, () => frame)
        const copy = pictureOfPage(document)
        expect(copy.querySelector('[data-frame="room"]')).toBe(frame)
        expect(frame.className).toBe('live-scene-canvas')
        expect(copy.querySelector('iframe')).toBeNull()
        expect(copy.querySelector('video')).toBeNull()
        expect(copy.querySelector('.preview')).toBeTruthy()
        expect(copy.querySelector('[id]')).toBeNull()
        expect(copy.id).toBe('')
        expect(copy.querySelector('.MuiTouchRipple-root').children).toHaveLength(0)
        expect(copy.hasAttribute('inert')).toBe(true)
    })

    it('keeps the page scrolled where the visitor had it', async () => {
        const root = buildPage()
        const scroller = root.querySelector('.lp-root')
        scroller.scrollTop = 240
        let copiedScroll = null
        const navigate = vi.fn(() => {
            copiedScroll = curtain()?.querySelector('.dii-entry-held .lp-root')?.scrollTop
            document.getElementById('root').appendChild(document.createElement('canvas'))
        })
        await enterDestination('/open_jam/scene', { navigate, reducedMotion: true, source: { hold: () => pictureOfPage(document) } })
        expect(copiedScroll).toBe(240)
    })
})

describe('enterFromElement', () => {
    it('leaves a modified click to behave like the link it is', () => {
        const event = { metaKey: true, button: 0, preventDefault: vi.fn() }
        expect(enterFromElement(event, '/wcc')).toBe(false)
        expect(event.preventDefault).not.toHaveBeenCalled()
        expect(enterFromElement({ button: 1, preventDefault: vi.fn() }, '/wcc')).toBe(false)
    })

    it('holds the page itself when asked to', async () => {
        const navigate = paintingNavigate()
        setAppNavigate(navigate)
        document.getElementById('root').innerHTML = '<a class="landing-cta-spaces" href="/spaces">The Spaces</a>'
        const button = document.querySelector('a')
        const event = { button: 0, preventDefault: vi.fn(), currentTarget: button }
        expect(enterFromElement(event, '/spaces', { holdPage: true })).toBe(true)
        expect(event.preventDefault).toHaveBeenCalled()
        expect(curtain()?.querySelector('.dii-entry-held .landing-cta-spaces')).toBeTruthy()
        await vi.waitFor(() => expect(isEntryInProgress()).toBe(false), { timeout: 3000 })
        expect(navigate).toHaveBeenCalledWith('/spaces', { replace: false })
        setAppNavigate(null)
    })
})
