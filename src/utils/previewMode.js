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

// `?embed=1` — this page is a WINDOW inside somebody else's page, not a
// destination. Every lane reads the same flag, so a surface rendered in a pane
// looks the same whichever lane it is.
//
// The contract, and it is narrow on purpose: embed hides NAVIGATION CHROME and
// nothing else. Never auth — an embedded page signs you in exactly as a tab
// does. Never what is saved — an edit made in a pane is the same edit. Never
// what data is shown — nothing is withheld from a window that a tab would get.
// A pane and a tab are the same program; only the way out is drawn differently,
// because the host page already owns the frame around it.
export function isEmbedRequest(search) {
    const raw = typeof search === 'string'
        ? search
        : (typeof window !== 'undefined' ? window.location.search : '')
    if (!raw) return false
    return new URLSearchParams(raw).get('embed') === '1'
}

// The message a preview iframe posts to its host once it has PIXELS on it.
// Both sides import this name so the string can never drift apart.
export const PREVIEW_READY_MESSAGE = 'dii:preview-ready'

// The message a preview iframe posts when it has NOTHING to paint: under
// DI_LOCAL_SLIM=1 a work's route is a stub (src/works/HostedPieceStub.jsx),
// a page of text with no canvas and no frame, so the paint watcher below would
// never report and the host would sit on a black card until its backstop. The
// stub says so instead, and the card draws its own line.
export const PREVIEW_STUB_MESSAGE = 'dii:preview-stub'

// The message a preview iframe posts once it has painted: a small JPEG still
// of its own canvas ({ type, spaceId, poster: 'data:image/jpeg;...' }). The
// host (SpaceHub's SpaceCardPreview) shows the still and tears the frame
// down, so a grid of N cards holds a fixed few live WebGL contexts instead of
// N. Same method as any many-previews grid: a picture per card, live only
// where the pointer is.
export const PREVIEW_POSTER_MESSAGE = 'dii:preview-poster'
const POSTER_WIDTH = 512
const POSTER_HEIGHT = 288
const POSTER_QUALITY = 0.72
// Give the scene a moment after "painted" so the still is the scene and not
// its first frame of fog.
const POSTER_SETTLE_MS = 700

// A WebGL canvas without preserveDrawingBuffer only holds its pixels inside
// the task that drew them, so a still taken later reads back black. A preview
// frame is a low-power thumbnail with a static camera, so keeping the buffer
// costs nothing visible there. Applied only to `?preview=1` documents inside
// a frame, before the app creates its first canvas.
export function enablePreviewPosterBuffer(win) {
    const proto = win?.HTMLCanvasElement?.prototype
    if (!proto || proto.__diiPosterPatched) return false
    const original = proto.getContext
    proto.getContext = function patchedGetContext(type, attrs) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
            return original.call(this, type, { ...(attrs || {}), preserveDrawingBuffer: true })
        }
        return original.call(this, type, attrs)
    }
    proto.__diiPosterPatched = true
    return true
}

// The largest canvas in the document drawn cover-fit into a 16:9 JPEG, or
// null when there is none or it is all black (a context that has not drawn).
export function capturePreviewPoster(doc) {
    try {
        const canvases = [...doc.querySelectorAll('canvas')].filter((c) => c.width > 16 && c.height > 16)
        if (!canvases.length) return null
        canvases.sort((a, b) => b.width * b.height - a.width * a.height)
        const source = canvases[0]
        const out = doc.createElement('canvas')
        out.width = POSTER_WIDTH
        out.height = POSTER_HEIGHT
        const ctx = out.getContext('2d')
        if (!ctx) return null
        const k = Math.max(POSTER_WIDTH / source.width, POSTER_HEIGHT / source.height)
        const w = source.width * k
        const h = source.height * k
        ctx.drawImage(source, (POSTER_WIDTH - w) / 2, (POSTER_HEIGHT - h) / 2, w, h)
        const px = ctx.getImageData(0, 0, POSTER_WIDTH, POSTER_HEIGHT).data
        let lit = 0
        for (let i = 0; i < px.length; i += 64) {
            if (px[i] + px[i + 1] + px[i + 2] > 24) lit += 1
        }
        // under 1 % lit sample points: black or empty, not a picture
        if (lit < (px.length / 64) * 0.01) return null
        return out.toDataURL('image/jpeg', POSTER_QUALITY)
    } catch {
        return null
    }
}

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

const postToPreviewHost = (type, spaceId, extra = null) => {
    if (typeof window === 'undefined') return false
    if (window.parent === window) return false
    try {
        window.parent.postMessage({ type, spaceId, ...(extra || {}) }, window.location.origin)
        return true
    } catch {
        return false
    }
}

export function signalPreviewReady(spaceId = '') {
    return postToPreviewHost(PREVIEW_READY_MESSAGE, spaceId)
}

export function signalPreviewStub(spaceId = '') {
    return postToPreviewHost(PREVIEW_STUB_MESSAGE, spaceId)
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
    enablePreviewPosterBuffer(w)
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
                w.setTimeout(() => {
                    const poster = capturePreviewPoster(d)
                    if (poster) postToPreviewHost(PREVIEW_POSTER_MESSAGE, spaceId, { poster })
                }, POSTER_SETTLE_MS)
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
