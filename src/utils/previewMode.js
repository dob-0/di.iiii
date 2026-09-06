// `?preview=1` — the page is embedded as a thumbnail in a Studio space card
// (SpaceHub.jsx), not opened by a visitor. PublicProjectViewer has honoured it
// since the cards were built, but a space with no published project renders the
// generic <App /> instead, which ignored it entirely: the card then showed the
// editor's Enter VR / Enter AR / Mode chrome instead of the scene.
export function isPreviewRequest(search) {
    const raw = typeof search === 'string'
        ? search
        : (typeof window !== 'undefined' ? window.location.search : '')
    if (!raw) return false
    return new URLSearchParams(raw).get('preview') === '1'
}

// The message a preview iframe posts to its host once it has PIXELS on it.
// Both sides import this name so the string can never drift apart.
export const PREVIEW_READY_MESSAGE = 'dii:preview-ready'

// A preview surface is painted when the app's one loading screen is gone AND
// something that actually draws is in the document: a WebGL canvas (every
// scene renderer) or an iframe (a code-mode published page, which is an
// <iframe srcDoc> and nothing else). Deliberately renderer-agnostic — the
// published-project path picks between three lazy renderers and the no-project
// path renders the generic <App />, and all four have to be able to say
// "ready" or the host's queue is back to guessing.
const isPreviewPainted = (doc) => {
    if (!doc) return false
    if (doc.querySelector('.loading-screen')) return false
    return Boolean(doc.querySelector('canvas, iframe'))
}

// How long a surface may take to paint before we let the host stop waiting on
// a signal that may never come. The host keeps its own backstop; this one only
// stops the watcher's frame loop.
const PAINT_GIVE_UP_MS = 30000
// Two consecutive frames with a drawn surface, not one: the frame a canvas is
// inserted on is the frame BEFORE the renderer has drawn into it.
const PAINT_STABLE_FRAMES = 2

export function signalPreviewReady(spaceId = '') {
    if (typeof window === 'undefined') return false
    if (window.parent === window) return false
    try {
        window.parent.postMessage({ type: PREVIEW_READY_MESSAGE, spaceId }, window.location.origin)
        return true
    } catch {
        return false
    }
}

// Watches this document until its preview surface has painted, then tells the
// host. Called once at app start (index.jsx) so it covers every route a space
// card can embed without each renderer having to remember to report.
//
// Why this exists: the host used to free the iframe's boot slot on the
// iframe's `load` event, which for an SPA fires ~100ms in — before the chunks,
// the scene document and the assets are anywhere. Twelve full app instances
// then booted at once, starved each other, and eight of twelve cards sat on
// the black loading screen indefinitely. Measured, not reasoned about.
export function watchPreviewPaint({ spaceId = '', doc = null, win = null } = {}) {
    const w = win || (typeof window !== 'undefined' ? window : null)
    if (!w || w.parent === w) return () => {}
    if (!isPreviewRequest()) return () => {}
    const d = doc || w.document
    const raf = typeof w.requestAnimationFrame === 'function'
        ? w.requestAnimationFrame.bind(w)
        : (fn) => w.setTimeout(() => fn(), 16)
    const startedAt = Date.now()
    let stopped = false
    let stable = 0

    const tick = () => {
        if (stopped) return
        if (isPreviewPainted(d)) {
            stable += 1
            if (stable >= PAINT_STABLE_FRAMES) {
                stopped = true
                signalPreviewReady(spaceId)
                return
            }
        } else {
            stable = 0
        }
        if (Date.now() - startedAt > PAINT_GIVE_UP_MS) {
            stopped = true
            return
        }
        raf(tick)
    }
    raf(tick)
    return () => { stopped = true }
}
