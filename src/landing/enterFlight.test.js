import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flyInside, visibleLayers, REST_POSE, WALK_POSE } from './enterFlight.js'

const HEIGHT = 900

const addElement = (root, className, rect) => {
    const el = window.document.createElement('div')
    el.className = className
    el.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height })
    root.appendChild(el)
    return el
}

describe('visibleLayers', () => {
    let root

    beforeEach(() => {
        root = window.document.createElement('div')
        window.document.body.appendChild(root)
    })

    afterEach(() => { window.document.body.innerHTML = '' })

    // Whatever is on screen is what flies. Someone who scrolled to the footer
    // and pressed the door there is looking at a section, not at the hero, and
    // lifting the hero would empty their screen instead of opening it.
    it('lifts what is on screen and leaves what is scrolled past', () => {
        const onScreen = addElement(root, 'lp-wordmark', { left: 500, top: 300, width: 400, height: 120 })
        addElement(root, 'lp-tagline', { left: 500, top: 1400, width: 400, height: 60 })
        addElement(root, 'lp-nav', { left: 0, top: -80, width: 1440, height: 56 })

        const layers = visibleLayers(root, HEIGHT)
        expect(layers).toHaveLength(1)
        expect(layers[0].el).toBe(onScreen)
    })

    it('skips anything with no box at all', () => {
        addElement(root, 'lp-wordmark', { left: 0, top: 0, width: 0, height: 0 })
        expect(visibleLayers(root, HEIGHT)).toHaveLength(0)
    })

    // A section taller than the frame does not come apart, it smears: on a
    // 390px phone the closing section is 1918px tall, and pushing it toward
    // the eye drew a wall of clipped display type past both edges with the
    // same sentence at two scales. It stays with the page.
    it('leaves behind anything too big to be seen leaving', () => {
        addElement(root, 'lp-section-inner', { left: 20, top: 0, width: 350, height: 1918 })
        addElement(root, 'lp-cta-sub', { left: 20, top: 100, width: 2000, height: 40 })
        expect(visibleLayers(root, HEIGHT, 390)).toHaveLength(0)

        const fits = addElement(root, 'lp-wordmark', { left: 100, top: 200, width: 200, height: 90 })
        expect(visibleLayers(root, HEIGHT, 390).map((l) => l.el)).toEqual([fits])
    })

    // The same words must never fly twice. A section carries its own copy of
    // the sub-line, and lifting both drew the sentence at two depths at once.
    it('lifts an ancestor or its child, never both', () => {
        const section = addElement(root, 'lp-section-inner', { left: 20, top: 100, width: 350, height: 400 })
        const child = window.document.createElement('div')
        child.className = 'lp-cta-sub'
        child.getBoundingClientRect = () => ({ left: 30, top: 200, width: 300, height: 30, right: 330, bottom: 230 })
        section.appendChild(child)

        const layers = visibleLayers(root, HEIGHT, 390)
        expect(layers).toHaveLength(1)
        expect(layers[0].el).toBe(section)
    })

    it('has nothing to lift without a page', () => {
        expect(visibleLayers(null, HEIGHT)).toEqual([])
    })
})

describe('flyInside', () => {
    let root
    let cameraPoseRef

    beforeEach(() => {
        window.innerWidth = 1440
        window.innerHeight = HEIGHT
        root = window.document.createElement('div')
        root.className = 'lp-root'
        window.document.body.appendChild(root)
        cameraPoseRef = { current: { ...REST_POSE } }
    })

    afterEach(() => {
        window.document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    // A visitor who asked for less motion is asking not to be flown anywhere.
    // They get the same destination, at once — never a different one, and
    // never a page that has been taken apart around them.
    it('hands a reduced-motion visitor the destination and no flight at all', () => {
        const onDone = vi.fn()
        addElement(root, 'lp-wordmark', { left: 500, top: 300, width: 400, height: 120 })

        flyInside({ root, cameraPoseRef, onDone, reducedMotion: true })

        expect(onDone).toHaveBeenCalledTimes(1)
        expect(cameraPoseRef.current.position).toEqual(WALK_POSE.position)
        expect(cameraPoseRef.current.target).toEqual(WALK_POSE.target)
        expect(window.document.querySelector('.lp-in-space')).toBeNull()
        expect(root.classList.contains('lp-root--flying')).toBe(false)
    })

    it('still arrives when there is no page to take apart', () => {
        const onDone = vi.fn()
        flyInside({ root: null, cameraPoseRef, onDone })
        expect(onDone).toHaveBeenCalledTimes(1)
        expect(cameraPoseRef.current.position).toEqual(WALK_POSE.position)
    })

    // The room decides where a visitor stands. This one authors a spawn nine
    // metres behind the default, and the flight used to land on the default
    // and then snap backwards the instant the walker took over.
    it('lands where the ROOM says the walker stands, not where the default does', () => {
        const endPose = { position: [0, 1.6, 15], target: [0, 1.6, -5] }
        flyInside({ root, cameraPoseRef, onDone: () => {}, reducedMotion: true, endPose })
        expect(cameraPoseRef.current.position).toEqual([0, 1.6, 15])
        expect(cameraPoseRef.current.target).toEqual([0, 1.6, -5])
    })

    it('falls back to the default when the room reports nothing usable', () => {
        flyInside({ root, cameraPoseRef, onDone: () => {}, reducedMotion: true, endPose: { position: [1, 2, 3] } })
        expect(cameraPoseRef.current.position).toEqual(WALK_POSE.position)
    })

    // The walk camera is wider than the composed shot, and the swap lands on
    // the same frame as the handover — so the flight has to arrive already
    // wearing it, or the room visibly pops open.
    it('arrives at the walk field of view, not the composed one', () => {
        flyInside({ root, cameraPoseRef, onDone: () => {}, reducedMotion: true })
        expect(cameraPoseRef.current.fov).toBe(60)
        expect(cameraPoseRef.current.fov).not.toBe(REST_POSE.fov)
    })

    // jsdom has no 2D canvas, and without one a piece cannot be drawn. That is
    // a real path, not a test artefact: a browser that refuses a context still
    // has to open the door, so the flight goes ahead with nothing to throw.
    const withCanvas = (fn) => {
        const original = window.HTMLCanvasElement.prototype.getContext
        window.HTMLCanvasElement.prototype.getContext = function stub() {
            return {
                scale() {}, fillRect() {}, strokeRect() {}, fillText() {},
                measureText: (text) => ({ width: (text || '').length * 8 }),
                set font(_v) {}, get font() { return '' },
                set fillStyle(_v) {}, set strokeStyle(_v) {}, set lineWidth(_v) {},
                set textBaseline(_v) {}, set letterSpacing(_v) {}
            }
        }
        try { fn() } finally { window.HTMLCanvasElement.prototype.getContext = original }
    }

    it('opens the door even where a 2D canvas is refused', () => {
        const el = addElement(root, 'lp-wordmark', { left: 500, top: 300, width: 400, height: 120 })
        const pieces = []
        const cancel = flyInside({ root, cameraPoseRef, onDone: () => {}, onPieces: (p) => pieces.push(...p) })
        expect(pieces).toHaveLength(0)
        expect(el.style.visibility).toBe('hidden')
        cancel()
        expect(el.style.visibility).toBe('')
    })

    // The page becomes objects in the ROOM'S scene, not a DOM layer above it —
    // that is what lets a door pass in front of a fallen piece. The handover is
    // the same shape as before: the piece is standing where the element stood
    // before the element is hidden.
    it('hands the page over as pieces, then hides the originals', () => {
        const el = addElement(root, 'lp-wordmark', { left: 500, top: 300, width: 400, height: 120 })
        expect(el.style.visibility).toBe('')
        const pieces = []
        let cancel = () => {}

        withCanvas(() => {
            cancel = flyInside({ root, cameraPoseRef, onDone: () => {}, onPieces: (p) => pieces.push(...p) })
        })

        expect(pieces).toHaveLength(1)
        expect(pieces[0].el).toBe(el)
        expect(el.style.visibility).toBe('hidden')
        expect(root.classList.contains('lp-root--flying')).toBe(true)
        // No DOM layer is left over the room any more.
        expect(window.document.querySelector('.lp-in-space')).toBeNull()

        // A cancelled flight puts the page back exactly as it found it —
        // otherwise an interrupted entry leaves a landing with holes in it.
        cancel()
        expect(el.style.visibility).toBe('')
        expect(root.classList.contains('lp-root--flying')).toBe(false)
    })

    // The last frame of the flight and the first frame of walking are the same
    // pose, which is the only reason the handover needs nothing to cover it.
    it('ends exactly where the walker begins', () => {
        expect(WALK_POSE.position).toEqual([0, 1.6, 6])
        expect(WALK_POSE.target[2]).toBeLessThan(WALK_POSE.position[2])
        expect(REST_POSE.fov).toBe(WALK_POSE.fov)
    })
})
