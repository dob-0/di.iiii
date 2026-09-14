import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetEntryForTests, carryReviewParams, enterDestination, enterFromElement, expandClips, isEntryInProgress } from './entryTransition.js'

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
        const entering = enterDestination('/br_id_ge', { navigate, variant: 'b', reducedMotion: false })
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
        await enterDestination('/wcc', { navigate, variant: 'c', reducedMotion: false })
        expect(curtainAtNavigation).toBeTruthy()
    })

    it('holds the room\'s last glide frame for variant a', async () => {
        const frame = document.createElement('canvas')
        let heldAtNavigation = false
        const navigate = vi.fn(() => {
            heldAtNavigation = curtain()?.contains(frame)
            document.getElementById('root').appendChild(document.createElement('canvas'))
        })
        const glide = vi.fn(() => Promise.resolve(frame))
        await enterDestination('/beyond-form', { navigate, variant: 'a', reducedMotion: false, source: { glide, color: '#ffffff' } })
        expect(glide).toHaveBeenCalledWith(expect.any(Number), { reach: 1 })
        expect(heldAtNavigation).toBe(true)
    })

    it('does not fly a visitor who asked for reduced motion', async () => {
        const glide = vi.fn(() => Promise.resolve(null))
        const capture = vi.fn(() => document.createElement('canvas'))
        await enterDestination('/wcc', { navigate: paintingNavigate(), variant: 'a', reducedMotion: true, source: { glide, capture } })
        expect(glide).not.toHaveBeenCalled()
        expect(capture).toHaveBeenCalled()
    })

    it('ignores a second door pressed while the first is opening', async () => {
        const navigate = paintingNavigate()
        const first = enterDestination('/a', { navigate, variant: 'b', reducedMotion: false })
        expect(await enterDestination('/b', { navigate, variant: 'b', reducedMotion: false })).toBe('busy')
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
        await enterDestination('/a', { navigate, variant: 'b', reducedMotion: false })
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
    it('carries ?entry and ?entryslow through the door and nothing else', () => {
        expect(carryReviewParams('/wcc', '?entry=c&tour=1')).toBe('/wcc?entry=c')
        expect(carryReviewParams('/a/b?x=1', '?entry=b&entryslow=6')).toBe('/a/b?x=1&entry=b&entryslow=6')
        expect(carryReviewParams('/wcc', '?tour=1')).toBe('/wcc')
    })
})

describe('expandClips', () => {
    const win = { innerWidth: 1000, innerHeight: 500 }

    it('opens a door as a circle that ends past the farthest corner', () => {
        const { from, to } = expandClips({ circle: { x: 100, y: 100, r: 40 } }, win)
        expect(from).toBe('circle(40.0px at 100.0px 100.0px)')
        const end = Number(to.match(/circle\((\d+)px/)[1])
        expect(end).toBeGreaterThanOrEqual(Math.hypot(900, 400))
    })

    it('opens a card as its own rectangle', () => {
        const { from, to } = expandClips({ rect: { left: 100, top: 50, width: 200, height: 100 } }, win)
        expect(from).toBe('inset(50px 700px 350px 100px)')
        expect(to).toBe('inset(0px 0px 0px 0px)')
    })
})

describe('enterFromElement', () => {
    it('leaves a modified click to behave like the link it is', () => {
        const event = { metaKey: true, button: 0, preventDefault: vi.fn() }
        expect(enterFromElement(event, '/wcc')).toBe(false)
        expect(event.preventDefault).not.toHaveBeenCalled()
        expect(enterFromElement({ button: 1, preventDefault: vi.fn() }, '/wcc')).toBe(false)
    })
})
