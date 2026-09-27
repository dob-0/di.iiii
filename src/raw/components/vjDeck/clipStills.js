// A still of every clip in the deck, the way Resolume's clip grid shows a
// thumbnail in every filled slot — not only the one playing. Seen missing by
// the owner on 2026-09-24: the slots that were not playing were dark, so the
// grid could not be read at a glance.
//
// The still is one frame of the clip's own file, grabbed once by a hidden
// <video> and kept as a small JPEG data URL for the life of the page. Which
// frame: a little into the clip's own window (its in point plus a tenth of the
// window, at most one second), because many clips open on a black frame.
// The live picture of a PLAYING clip still comes from the engine
// (registerTopThumbnail); this is only the at-rest picture.
//
// Two grabs at a time at most — a deck of forty clips must not open forty
// decoders at once — and a clip that cannot be read (a codec the browser does
// not play, a file that is gone) gives null, and its slot shows its name.

const WIDTH = 160
const HEIGHT = 90
const TIMEOUT_MS = 10000
const MAX_AT_ONCE = 2

const cache = new Map() // key → Promise<string|null>
const queue = []
let running = 0

export const stillKey = (url, inPoint = 0, outPoint = 1) => `${url}#${Math.round(inPoint * 1000)}-${Math.round(outPoint * 1000)}`

/** Where in the file (seconds) the still is taken, for a clip window of [in, out] (0..1). */
export const stillTime = (duration, inPoint = 0, outPoint = 1) => {
    if (!(duration > 0) || !Number.isFinite(duration)) return 0
    const low = Math.min(inPoint, outPoint)
    const high = Math.max(inPoint, outPoint)
    const start = low * duration
    const span = Math.max(0, (high - low) * duration) || duration
    return Math.min(duration, start + Math.min(1, span * 0.1))
}

const pump = () => {
    while (running < MAX_AT_ONCE && queue.length) {
        const job = queue.shift()
        running += 1
        job().finally(() => {
            running -= 1
            pump()
        })
    }
}

const grab = (url, inPoint, outPoint) => new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return }
    const video = document.createElement('video')
    let done = false
    const finish = (value) => {
        if (done) return
        done = true
        clearTimeout(timer)
        video.removeAttribute('src')
        try { video.load() } catch { /* already gone */ }
        resolve(value)
    }
    const timer = setTimeout(() => finish(null), TIMEOUT_MS)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.addEventListener('error', () => finish(null))
    video.addEventListener('loadedmetadata', () => {
        try {
            video.currentTime = stillTime(video.duration, inPoint, outPoint)
        } catch {
            finish(null)
        }
    })
    video.addEventListener('seeked', () => {
        try {
            const canvas = document.createElement('canvas')
            canvas.width = WIDTH
            canvas.height = HEIGHT
            const context = canvas.getContext('2d')
            if (!context) { finish(null); return }
            // Cover, like the tile: the middle of the frame, not a squashed whole.
            const vw = video.videoWidth || WIDTH
            const vh = video.videoHeight || HEIGHT
            const scale = Math.max(WIDTH / vw, HEIGHT / vh)
            const dw = vw * scale
            const dh = vh * scale
            context.drawImage(video, (WIDTH - dw) / 2, (HEIGHT - dh) / 2, dw, dh)
            finish(canvas.toDataURL('image/jpeg', 0.72))
        } catch {
            // A tainted canvas (a file served without CORS) cannot be read back.
            finish(null)
        }
    })
    video.src = url
})

/**
 * The still for one clip: a promise of a data URL, or null when there is
 * none. Asked twice, grabbed once.
 */
export const clipStill = (url, inPoint = 0, outPoint = 1) => {
    if (!url) return Promise.resolve(null)
    const key = stillKey(url, inPoint, outPoint)
    if (cache.has(key)) return cache.get(key)
    const promise = new Promise((resolve) => {
        queue.push(() => grab(url, inPoint, outPoint).then((value) => { resolve(value); return value }))
        pump()
    })
    cache.set(key, promise)
    return promise
}

/** For tests. */
export const forgetClipStills = () => {
    cache.clear()
    queue.length = 0
}
