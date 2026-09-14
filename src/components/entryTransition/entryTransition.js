import { appNavigate } from '../../utils/appNavigate.js'
import {
    ENTRY_GROUND,
    entryTone,
    isDestinationPainted,
    PAINT_BACKSTOP_MS,
    PAINT_STABLE_FRAMES,
    planEntry,
    prefersReducedMotion,
    QUIET_PAINT_MS,
    resolveEntrySlowdown,
    resolveEntryVariant
} from './entryPlan.js'

// Going THROUGH a door, drawn. The decisions are in entryPlan.js; this file
// only carries them out.
//
// The one idea every variant shares: the view being left is never replaced by
// black. A curtain is laid over the page on document.body — outside React's
// root, so it survives the route change that unmounts everything beneath it —
// and it holds the old view (or the move out of it) until the destination has
// actually painted underneath. Only then does it let go.

const CURTAIN_Z = 2147483000
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)'
const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const EASE_IN = 'cubic-bezier(0.55, 0, 0.75, 0.25)'
// The held frame keeps travelling after the camera stops. It starts at about
// the speed the glide ended on and runs out gently, so there is no seam
// between the room's last frame and the picture of it.
const DRIFT_EASE = 'cubic-bezier(0.3, 0.55, 0.4, 1)'
const DRIFT_MS = 2600

let active = null

export const isEntryInProgress = () => Boolean(active)

const nextFrame = (win) => new Promise((resolve) => win.requestAnimationFrame(() => resolve()))

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
        const loading = doc.querySelector('.loading-screen, .live-scene-loading')
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

const insetFor = (rect, win) => {
    if (!rect) return 'inset(50% 50% 50% 50%)'
    const top = Math.max(0, rect.top)
    const left = Math.max(0, rect.left)
    const right = Math.max(0, win.innerWidth - (rect.left + rect.width))
    const bottom = Math.max(0, win.innerHeight - (rect.top + rect.height))
    return `inset(${top}px ${right}px ${bottom}px ${left}px)`
}

// The shape the expanding panel starts from and ends at. A door is round, so
// its opening grows as a circle until it covers the farthest corner; a card
// is square-cornered, so it grows as its own rectangle.
export const expandClips = (source, win) => {
    const w = Math.max(1, win.innerWidth)
    const h = Math.max(1, win.innerHeight)
    const c = source?.circle
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y) && c.r > 0) {
        const far = Math.max(
            Math.hypot(c.x, c.y), Math.hypot(w - c.x, c.y),
            Math.hypot(c.x, h - c.y), Math.hypot(w - c.x, h - c.y)
        )
        return { from: `circle(${c.r.toFixed(1)}px at ${c.x.toFixed(1)}px ${c.y.toFixed(1)}px)`, to: `circle(${Math.ceil(far + 2)}px at ${c.x.toFixed(1)}px ${c.y.toFixed(1)}px)` }
    }
    return { from: insetFor(source?.rect || null, win), to: 'inset(0px 0px 0px 0px)' }
}

const snapshotLayer = (doc, canvas) => {
    const holder = layer(doc, { background: ENTRY_GROUND })
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' })
    holder.appendChild(canvas)
    return holder
}

/**
 * Go through a door.
 *
 * @param {string} href           where the door leads
 * @param {object} [options]
 * @param {object} [options.source]
 *   colour   the door's colour (a card passes nothing)
 *   rect     the pressed thing's box on screen, CSS px
 *   image    a picture of the destination the card already shows (url)
 *   ground   the destination's own ground colour, when the card can tell
 *   glide    (ms, { reach }) => Promise<HTMLCanvasElement|null>  — a room
 *            travels its camera toward the door and hands back its last frame
 *   capture  () => HTMLCanvasElement|null — the room's current frame, now
 * @param {Function} [options.navigate]
 * @param {Window}   [options.win]
 * @returns {Promise<string>} how it ended
 */
export async function enterDestination(href, { source = {}, navigate = appNavigate, win = typeof window === 'undefined' ? null : window, variant = null, reducedMotion = null } = {}) {
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
        variant: variant || resolveEntryVariant(search),
        reducedMotion: reducedMotion ?? prefersReducedMotion(win),
        hasScene,
        slow: resolveEntrySlowdown(search)
    })
    // The variant travels with the visit, so a reviewer comparing b against a
    // can walk from door to door without re-typing it on every address.
    const target = carryReviewParams(href, search)

    const curtain = makeCurtain(doc)
    hideChrome(doc)
    const tone = entryTone(source.color, plan.kind === 'dissolve' ? 0.34 : 0.26)
    active = { curtain, plan }
    if (import.meta.env?.DEV) win.__diiEntry = { plan, phase: 'cover', target }
    const phase = (name) => { if (import.meta.env?.DEV && win.__diiEntry) win.__diiEntry.phase = name }
    let reveal = null
    let settleOrigin = '50% 50%'
    const root = appRoot(doc)

    try {
        if (plan.kind === 'fade') {
            const still = source.capture?.()
            if (still) {
                reveal = snapshotLayer(doc, still)
                curtain.appendChild(reveal)
            } else {
                reveal = layer(doc, { background: source.ground || ENTRY_GROUND, opacity: '0' })
                curtain.appendChild(reveal)
                await animate(reveal, [{ opacity: 0 }, { opacity: 1 }], { duration: plan.coverMs, easing: 'linear' }).finished
            }
        } else if (plan.kind === 'glide') {
            if (hasScene || source.capture) {
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
                ], { duration: DRIFT_MS * resolveEntrySlowdown(search), easing: DRIFT_EASE })
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
        } else if (plan.kind === 'dissolve') {
            reveal = layer(doc, { background: source.ground || tone, opacity: '0' })
            curtain.appendChild(reveal)
            if (hasScene) source.glide(plan.glideMs, { reach: plan.glideReach })
            await animate(reveal, [{ opacity: 0 }, { opacity: 1 }], { duration: plan.coverMs, easing: EASE_IN_OUT }).finished
        } else {
            // expand
            const rect = source.rect || null
            const clips = expandClips(source, win)
            settleOrigin = source.circle ? `${source.circle.x}px ${source.circle.y}px` : rectOrigin(rect, win)
            const dim = layer(doc, { background: ENTRY_GROUND, opacity: '0' })
            curtain.appendChild(dim)
            // The panel is the door's own colour, deepest at its rim, so the
            // opening has depth rather than reading as a flat box.
            const centre = source.circle ? `${source.circle.x}px ${source.circle.y}px` : '50% 50%'
            reveal = layer(doc, {
                background: source.ground || source.image
                    ? (source.ground || ENTRY_GROUND)
                    : `radial-gradient(circle at ${centre}, ${entryTone(source.color, 0.42)} 0%, ${tone} 45%, ${ENTRY_GROUND} 120%)`,
                clipPath: clips.from
            })
            if (source.image && !source.ground) {
                const img = doc.createElement('img')
                img.alt = ''
                img.src = source.image
                Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', opacity: '0.9' })
                reveal.appendChild(img)
            }
            curtain.appendChild(reveal)
            animate(dim, [{ opacity: 0 }, { opacity: 0.5 }], { duration: plan.coverMs, easing: EASE_IN_OUT })
            await animate(reveal, [
                { clipPath: clips.from },
                { clipPath: clips.to }
            ], { duration: plan.coverMs, easing: EASE_IN_OUT }).finished
            dim.remove()
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
        await waitForDestination(win, { before, curtain })
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

// `?entry` and `?entryslow` are review knobs. They follow the visitor through
// the door so the variant being judged is the one that plays at the next door
// too — and nothing else of the page's query does.
export const carryReviewParams = (href, search) => {
    const from = new URLSearchParams(search || '')
    const carried = ['entry', 'entryslow'].filter((key) => from.has(key))
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

// Shorthand for the DOM doors: a card on /spaces, a featured-exhibition button.
// A modified click still behaves like the link it is.
export const enterFromElement = (event, href, { color = null, image = null, element = null } = {}) => {
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (typeof event.button === 'number' && event.button !== 0))) return false
    event?.preventDefault?.()
    const el = element || event?.currentTarget || null
    const rect = el?.getBoundingClientRect ? el.getBoundingClientRect() : null
    enterDestination(href, { source: { rect, color, image, ground: sampleSurfaceColour(el) } })
    return true
}

export const __resetEntryForTests = () => { active = null }
