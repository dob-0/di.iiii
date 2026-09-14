import { appNavigate } from '../../utils/appNavigate.js'
import {
    ENTRY_GROUND,
    entryTone,
    isDestinationPainted,
    isShowing,
    PAINT_BACKSTOP_MS,
    PAINT_STABLE_FRAMES,
    planEntry,
    prefersReducedMotion,
    QUIET_PAINT_MS,
    resolveEntrySlowdown
} from './entryPlan.js'

// Going THROUGH a door, drawn. The decisions are in entryPlan.js; this file
// only carries them out.
//
// The one idea every door shares: the view being left is never replaced by
// black. A curtain is laid over the page on document.body — outside React's
// root, so it survives the route change that unmounts everything beneath it —
// and it holds the old view (or the move out of it) until the destination has
// actually painted underneath. Only then does it let go.

const CURTAIN_Z = 2147483000
const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const EASE_IN = 'cubic-bezier(0.55, 0, 0.75, 0.25)'
// The held frame keeps travelling after the camera stops. It starts at about
// the speed the glide ended on and runs out gently, so there is no seam
// between the room's last frame and the picture of it.
const DRIFT_EASE = 'cubic-bezier(0.3, 0.55, 0.4, 1)'
// A page held still has no speed to pick up: its push starts from rest,
// gathers slowly and is still travelling when the destination comes up.
const PUSH_EASE = 'cubic-bezier(0.42, 0, 0.3, 1)'
// How far a held page darkens under the push — enough that the destination
// coming up reads as arriving, never so far that the frame reads as black.
const PUSH_DIM = 0.22

let active = null

export const isEntryInProgress = () => Boolean(active)

const nextFrame = (win) => new Promise((resolve) => win.requestAnimationFrame(() => resolve()))
const wait = (win, ms) => new Promise((resolve) => (ms > 0 ? win.setTimeout(resolve, ms) : resolve()))

const animate = (el, keyframes, options) => {
    if (!el || typeof el.animate !== 'function') return { finished: Promise.resolve(), cancel: () => {} }
    const animation = el.animate(keyframes, { fill: 'forwards', ...options })
    return { finished: animation.finished.catch(() => {}), cancel: () => animation.cancel() }
}

const layer = (doc, style = {}) => {
    const el = doc.createElement('div')
    Object.assign(el.style, { position: 'absolute', inset: '0', ...style })
    return el
}

const makeCurtain = (doc) => {
    const curtain = doc.createElement('div')
    curtain.className = 'dii-entry-curtain'
    curtain.setAttribute('aria-hidden', 'true')
    Object.assign(curtain.style, {
        position: 'fixed',
        inset: '0',
        zIndex: String(CURTAIN_Z),
        pointerEvents: 'auto',
        overflow: 'hidden',
        contain: 'strict'
    })
    doc.body.appendChild(curtain)
    return curtain
}

// The room's controls are not part of the picture. A camera travelling into a
// door with "← Back" and a WASD hint pinned over it reads as a screen
// recording, not a move — so for the length of an entry they step out.
const CHROME_SELECTORS = [
    '.lp-enter-exit', '.lp-enter-hint',
    '.live-scene-chrome', '.live-scene-hint', '.live-scene-nearest', '.live-scene-exit',
    '.live-scene-joystick', '.live-scene-vert-controls', '.live-scene-fly-btn',
    '.mode-mark'
]
const CHROME_STYLE_ID = 'dii-entry-chrome'

const hideChrome = (doc) => {
    if (!doc.getElementById(CHROME_STYLE_ID)) {
        const style = doc.createElement('style')
        style.id = CHROME_STYLE_ID
        style.textContent = `${CHROME_SELECTORS.map((sel) => `body.dii-entering ${sel}`).join(', ')} { opacity: 0 !important; transition: opacity 280ms ease !important; pointer-events: none !important; }`
        doc.head.appendChild(style)
    }
    doc.body.classList.add('dii-entering')
}

const surfaceSet = (doc) => new Set(doc.querySelectorAll('canvas, iframe'))

// Resolves once the destination has painted, or once the backstop says the
// curtain has waited long enough for something that may never come.
const waitForDestination = (win, { before, curtain }) => new Promise((resolve) => {
    const doc = win.document
    const started = win.performance.now()
    let stable = 0
    let quietSince = null
    const tick = () => {
        const now = win.performance.now()
        if (now - started > PAINT_BACKSTOP_MS) { resolve('backstop'); return }
        if (isDestinationPainted(doc, { before, curtain })) {
            stable += 1
            if (stable >= PAINT_STABLE_FRAMES) { resolve('painted'); return }
        } else {
            stable = 0
        }
        const loading = Array.from(doc.querySelectorAll('.loading-screen, .live-scene-loading'))
            .some((el) => !curtain.contains(el) && isShowing(el))
        if (loading) {
            quietSince = null
        } else if (quietSince === null) {
            quietSince = now
        } else if (now - quietSince > QUIET_PAINT_MS) {
            resolve('quiet')
            return
        }
        win.requestAnimationFrame(tick)
    }
    win.requestAnimationFrame(tick)
})

const appRoot = (doc) => doc.getElementById('root')

// The colour behind the page being held, so its copy sits on its own ground.
const pageGround = (win, root) => {
    try {
        const bg = root ? win.getComputedStyle(root).backgroundColor : ''
        return isVisibleColour(bg) ? bg : ENTRY_GROUND
    } catch {
        return ENTRY_GROUND
    }
}

// The destination arriving: a slow settle of the whole app from a hair off its
// final scale. Applied to #root, which base.css pins to the viewport, so fixed
// children scale with it and nothing reflows.
const settleDestination = (doc, plan, origin = '50% 50%') => {
    const root = appRoot(doc)
    if (!root || !(plan.settleMs > 0) || plan.settleFrom === 1) return Promise.resolve()
    root.style.transformOrigin = origin
    const run = animate(root, [
        { transform: `scale(${plan.settleFrom})` },
        { transform: 'scale(1)' }
    ], { duration: plan.settleMs, easing: EASE_OUT, fill: 'none' })
    return run.finished.then(() => { root.style.transformOrigin = '' })
}

const rectOrigin = (rect, win) => {
    if (!rect) return '50% 50%'
    const x = ((rect.left + rect.width / 2) / Math.max(1, win.innerWidth)) * 100
    const y = ((rect.top + rect.height / 2) / Math.max(1, win.innerHeight)) * 100
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
}

const snapshotLayer = (doc, picture, background = ENTRY_GROUND) => {
    const holder = layer(doc, { background })
    Object.assign(picture.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' })
    holder.appendChild(picture)
    return holder
}

// ─── A picture of the page, for a door that has no room behind it ──────────
//
// A button on the front page is a door with nothing 3D to travel through, and
// the router is about to unmount everything under it. The page cannot be
// rasterised, but it can be COPIED: the app's DOM is cloned into the curtain,
// where it keeps every class and so every style, and stays exactly where it
// was on screen while the real one is torn down beneath it. What a copy of
// the DOM cannot carry is what the page DRAWS — a WebGL canvas copies blank,
// and a cloned iframe or video would start loading all over again — so each
// canvas is swapped for its current frame and each frame for an empty box.

// A live WebGL canvas cannot be read after its frame was presented; the scene
// that owns it can re-render and copy in the same task (captureRendererFrame).
// A scene registers that ability against its canvas here.
const frameSources = new Map()

export const registerFrameSource = (canvas, capture) => {
    if (!canvas || typeof capture !== 'function') return () => {}
    frameSources.set(canvas, capture)
    return () => { if (frameSources.get(canvas) === capture) frameSources.delete(canvas) }
}

const frameOfCanvas = (canvas) => {
    const doc = canvas.ownerDocument
    try {
        const registered = frameSources.get(canvas)
        if (registered) return registered() || null
        if (!canvas.width || !canvas.height) return null
        const copy = doc.createElement('canvas')
        copy.width = canvas.width
        copy.height = canvas.height
        copy.getContext('2d')?.drawImage(canvas, 0, 0)
        return copy
    } catch {
        return null
    }
}

const HELD_CLASS = 'dii-entry-held'
const HELD_STYLE_ID = 'dii-entry-held-style'

// A copied element starts its CSS animations again from the beginning — a hero
// that faded in on arrival would fade in a second time. Every animation in the
// copy is set to have long since finished, and nothing in it transitions.
const ensureHeldStyle = (doc) => {
    if (doc.getElementById(HELD_STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = HELD_STYLE_ID
    style.textContent = `.${HELD_CLASS}, .${HELD_CLASS} *, .${HELD_CLASS} *::before, .${HELD_CLASS} *::after { animation-delay: -600s !important; transition: none !important; scroll-behavior: auto !important; }`
    doc.head.appendChild(style)
}

/**
 * The page as it is on screen now, as a detached element ready to lay into
 * the curtain. `from` is the element to copy (the app root by default).
 * Scroll positions are applied once the copy is in the document — see
 * `placeHeldPage`.
 */
export const pictureOfPage = (doc, from = doc?.getElementById?.('root')) => {
    if (!doc || !from) return null
    ensureHeldStyle(doc)
    const copy = from.cloneNode(true)
    copy.removeAttribute('id')
    copy.classList.add(HELD_CLASS)
    copy.setAttribute('inert', '')
    const originals = from.querySelectorAll('*')
    const copies = copy.querySelectorAll('*')
    const scrolls = []
    if (from.scrollTop || from.scrollLeft) scrolls.push([copy, from.scrollTop, from.scrollLeft])
    const swaps = []
    for (let i = 0; i < originals.length && i < copies.length; i += 1) {
        const original = originals[i]
        const copied = copies[i]
        if (copied.id) copied.removeAttribute('id')
        if (original.scrollTop || original.scrollLeft) scrolls.push([copied, original.scrollTop, original.scrollLeft])
        const tag = original.tagName
        if (tag === 'CANVAS' || tag === 'IFRAME' || tag === 'VIDEO') {
            const replacement = (tag === 'CANVAS' && frameOfCanvas(original)) || doc.createElement('div')
            replacement.className = original.getAttribute('class') || ''
            replacement.style.cssText = original.style.cssText
            // Whatever the element's box was, the picture keeps it.
            const box = original.getBoundingClientRect?.()
            if (box && box.width && box.height && tag === 'CANVAS') {
                replacement.style.width = `${box.width}px`
                replacement.style.height = `${box.height}px`
            }
            swaps.push([copied, replacement])
        }
    }
    // A pressed MUI button is mid-ripple; the copy would keep the ripple lit.
    copy.querySelectorAll('.MuiTouchRipple-root').forEach((el) => el.replaceChildren())
    swaps.forEach(([copied, replacement]) => copied.replaceWith(replacement))
    Object.assign(copy.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', overflow: 'hidden', transform: 'none' })
    copy.__diiScrolls = scrolls
    return copy
}

// Scroll offsets only take once the copy is laid out in the document.
const placeHeldPage = (holder, picture) => {
    holder.appendChild(picture)
    const scrolls = picture.__diiScrolls || []
    scrolls.forEach(([el, top, left]) => {
        el.scrollTop = top
        el.scrollLeft = left
    })
    delete picture.__diiScrolls
}

/**
 * Go through a door.
 *
 * @param {string} href           where the door leads
 * @param {object} [options]
 * @param {object} [options.source]
 *   colour   the door's colour (a card passes nothing)
 *   rect     the pressed thing's box on screen, CSS px
 *   ground   the destination's own ground colour, when the card can tell
 *   glide    (ms, { reach }) => Promise<HTMLCanvasElement|null>  — a room
 *            travels its camera toward the door and hands back its last frame
 *   capture  () => HTMLCanvasElement|null — the room's current frame, now
 *   hold     () => HTMLElement|null — a picture of the whole page as it is
 *            (pictureOfPage), for a door with no room behind it
 * @param {Function} [options.navigate]
 * @param {Window}   [options.win]
 * @returns {Promise<string>} how it ended
 */
export async function enterDestination(href, { source = {}, navigate = appNavigate, win = typeof window === 'undefined' ? null : window, reducedMotion = null } = {}) {
    if (!href) return 'no-destination'
    if (!win || !win.document?.body) {
        navigate(href)
        return 'no-window'
    }
    if (active) return 'busy'
    const doc = win.document
    const search = win.location?.search || ''
    const hasScene = typeof source.glide === 'function'
    const plan = planEntry({
        reducedMotion: reducedMotion ?? prefersReducedMotion(win),
        hasScene,
        slow: resolveEntrySlowdown(search)
    })
    // The review slowdown travels with the visit, so a reviewer can walk from
    // door to door without re-typing it on every address.
    const target = carryReviewParams(href, search)

    const curtain = makeCurtain(doc)
    hideChrome(doc)
    const tone = entryTone(source.color, 0.26)
    active = { curtain, plan }
    if (import.meta.env?.DEV) win.__diiEntry = { plan, phase: 'cover', target }
    const phase = (name) => { if (import.meta.env?.DEV && win.__diiEntry) win.__diiEntry.phase = name }
    let reveal = null
    let settleOrigin = '50% 50%'
    // Resolves once the move has run long enough for the destination to come
    // up over it. Only a held page sets it: every other move is complete
    // before the route changes.
    let lead = Promise.resolve()
    const root = appRoot(doc)

    try {
        if (plan.kind === 'fade') {
            const held = source.hold?.()
            const still = held ? null : source.capture?.()
            if (held) {
                reveal = layer(doc, { background: pageGround(win, root) })
                curtain.appendChild(reveal)
                placeHeldPage(reveal, held)
            } else if (still) {
                reveal = snapshotLayer(doc, still)
                curtain.appendChild(reveal)
            } else {
                reveal = layer(doc, { background: source.ground || ENTRY_GROUND, opacity: '0' })
                curtain.appendChild(reveal)
                await animate(reveal, [{ opacity: 0 }, { opacity: 1 }], { duration: plan.coverMs, easing: 'linear' }).finished
            }
        } else {
            const held = hasScene ? null : source.hold?.()
            if (held) {
                // A front-page button: the page itself stays up, copied into
                // the curtain in this same task so no frame goes without it,
                // and the view pushes slowly in toward the thing pressed. The
                // route changes underneath straight away — the push is still
                // travelling when the destination is ready to come up.
                const origin = rectOrigin(source.rect, win)
                settleOrigin = origin
                reveal = layer(doc, { background: pageGround(win, root) })
                curtain.appendChild(reveal)
                placeHeldPage(reveal, held)
                held.style.transformOrigin = origin
                animate(held, [
                    { transform: 'scale(1)' },
                    { transform: `scale(${plan.driftScale})` }
                ], { duration: plan.driftMs, easing: PUSH_EASE })
                const dim = layer(doc, { background: ENTRY_GROUND, opacity: '0', pointerEvents: 'none' })
                reveal.appendChild(dim)
                animate(dim, [{ opacity: 0 }, { opacity: PUSH_DIM }], { duration: plan.driftMs, easing: 'linear' })
                lead = wait(win, plan.leadMs)
            } else if (hasScene || source.capture) {
                // The curtain stays empty and click-blocking while the room
                // travels; the room's own last frame becomes the curtain. A
                // room that cannot travel (the visitor walked into the ring)
                // hands over the frame they are already looking at.
                const frame = hasScene
                    ? await source.glide(plan.glideMs, { reach: plan.glideReach })
                    : source.capture()
                reveal = frame ? snapshotLayer(doc, frame) : layer(doc, { background: tone })
                curtain.appendChild(reveal)
                animate(reveal, [
                    { transform: 'scale(1)' },
                    { transform: `scale(${plan.driftScale})` }
                ], { duration: plan.driftMs, easing: DRIFT_EASE })
            } else {
                settleOrigin = rectOrigin(source.rect, win)
                reveal = layer(doc, { background: source.ground || ENTRY_GROUND, opacity: '0' })
                curtain.appendChild(reveal)
                if (root) root.style.transformOrigin = settleOrigin
                const push = animate(root, [
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.06)' }
                ], { duration: plan.coverMs, easing: EASE_IN })
                await animate(reveal, [{ opacity: 0 }, { opacity: 1 }], { duration: plan.coverMs, easing: EASE_IN }).finished
                push.cancel()
            }
        }

        phase('hold')
        const before = surfaceSet(doc)
        if (root) {
            root.style.transform = ''
            root.style.transformOrigin = ''
        }
        navigate(target)
        // One frame for the router to commit before anything is measured.
        await nextFrame(win)
        await Promise.all([waitForDestination(win, { before, curtain }), lead])
        phase('reveal')
        doc.body.classList.remove('dii-entering')

        const settling = settleDestination(doc, plan, settleOrigin)
        await animate(curtain, [{ opacity: 1 }, { opacity: 0 }], {
            duration: plan.revealMs,
            easing: plan.kind === 'fade' ? 'linear' : EASE_OUT
        }).finished
        curtain.style.pointerEvents = 'none'
        await settling
        return 'entered'
    } finally {
        doc.body.classList.remove('dii-entering')
        curtain.remove()
        if (root) {
            root.style.transform = ''
            root.style.transformOrigin = ''
        }
        active = null
        phase('done')
    }
}

// `?entryslow` is a review knob. It follows the visitor through the door so
// the next door plays slowed too — and nothing else of the page's query does.
export const carryReviewParams = (href, search) => {
    const from = new URLSearchParams(search || '')
    const carried = ['entryslow'].filter((key) => from.has(key))
    if (!carried.length) return href
    const [path, query = ''] = String(href).split('?')
    const to = new URLSearchParams(query)
    carried.forEach((key) => { if (!to.has(key)) to.set(key, from.get(key)) })
    return `${path}?${to.toString()}`
}

const isVisibleColour = (value) => {
    const v = String(value || '').replace(/\s+/g, '')
    if (!v || v === 'transparent') return false
    const m = v.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/)
    return !(m && Number(m[4]) < 0.5)
}

const averageCanvas = (canvas) => {
    try {
        const probe = canvas.ownerDocument.createElement('canvas')
        probe.width = 6
        probe.height = 6
        const ctx = probe.getContext('2d')
        ctx.drawImage(canvas, 0, 0, 6, 6)
        const data = ctx.getImageData(0, 0, 6, 6).data
        let r = 0; let g = 0; let b = 0; let n = 0
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1
        }
        // A WebGL buffer read after it was presented comes back empty.
        if (n < 18) return null
        return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
    } catch {
        return null
    }
}

/**
 * The ground colour of the destination a card is ALREADY showing.
 *
 * A space card's picture is a live, same-origin frame of the very page the
 * card opens. So the card knows what the first frame on the other side looks
 * like before anyone has gone there — cream for br_id_ge, blue for the front
 * room — and the panel it opens into can be that colour instead of black.
 * Walks nested same-origin frames (a published page is an iframe inside the
 * viewer); anything cross-origin, blank or unreadable answers null.
 */
export const sampleSurfaceColour = (element, depth = 0) => {
    if (!element || depth > 4) return null
    try {
        const frame = element.tagName === 'IFRAME' ? element : element.querySelector?.('iframe')
        if (frame) return sampleDocumentCentre(frame.contentDocument, depth + 1)
        const img = element.tagName === 'IMG' ? element : element.querySelector?.('img')
        if (img?.complete && img.naturalWidth > 0) return averageCanvasFromImage(img)
    } catch {
        return null
    }
    return null
}

// What is drawn at the middle of a document: follow nested frames down, read
// a canvas's pixels, otherwise the first painted background behind the centre.
const sampleDocumentCentre = (doc, depth) => {
    const view = doc?.defaultView
    if (!view || !doc.body) return null
    const x = Math.max(0, (view.innerWidth || 0) / 2)
    const y = Math.max(0, (view.innerHeight || 0) / 2)
    // The whole stack under the centre, top first: a preview lays transparent
    // hit layers over what it draws, and the colour lives underneath them.
    const stack = typeof doc.elementsFromPoint === 'function' ? doc.elementsFromPoint(x, y) : []
    for (const el of stack) {
        // A frame we cannot read (a published page is a sandboxed srcdoc) is
        // an honest "don't know" — the colour of its host behind it is not
        // the colour of what it draws.
        if (el.tagName === 'IFRAME') return sampleSurfaceColour(el, depth)
        if (el.tagName === 'CANVAS') {
            const averaged = averageCanvas(el)
            if (averaged) return averaged
            continue
        }
        const bg = view.getComputedStyle(el).backgroundColor
        if (isVisibleColour(bg)) return bg
    }
    return null
}

const averageCanvasFromImage = (img) => {
    try {
        const probe = img.ownerDocument.createElement('canvas')
        probe.width = 1
        probe.height = 1
        const ctx = probe.getContext('2d')
        ctx.drawImage(img, 0, 0, 1, 1)
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        return `rgb(${r}, ${g}, ${b})`
    } catch {
        return null
    }
}

// Shorthand for the DOM doors: a card on /spaces, a button on the front page.
// A modified click still behaves like the link it is. `holdPage` keeps the
// page itself on screen through the move (see pictureOfPage) — for a page
// with nothing live in it that a copy would lose, which a card grid full of
// live previews is not.
export const enterFromElement = (event, href, { color = null, element = null, holdPage = false } = {}) => {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (typeof event.button === 'number' && event.button !== 0))) return false
    event?.preventDefault?.()
    const el = element || event?.currentTarget || null
    const rect = el?.getBoundingClientRect ? el.getBoundingClientRect() : null
    const doc = el?.ownerDocument || (typeof document === 'undefined' ? null : document)
    const hold = holdPage && doc ? () => pictureOfPage(doc) : null
    enterDestination(href, { source: { rect, color, hold, ground: hold ? null : sampleSurfaceColour(el) } })
    return true
}

export const __resetEntryForTests = () => {
    active = null
    frameSources.clear()
}
