import { createPreviewScheduler } from './previewScheduler.js'

// The one place every card preview on the page meets the one renderer. Module
// state rather than props for the same reason as topThumbnails.js: the cards
// are drawn by the graph surface, and threading a renderer through it would
// touch every card and Studio's read-only wrapper too.
//
// The renderer (three.js + React Three Fiber + RawViewport's bodies) is loaded
// on the first registration only, so a desk with no previewed node — and every
// jsdom test — never pays for it.

let renderer = null
let rendererState = 'idle' // idle | loading | ready | failed
const stats = { draws: 0, totalMs: 0, lastMs: 0, maxMs: 0 }

const scheduler = createPreviewScheduler({
    draw: (entry, frame) => {
        if (rendererState !== 'ready') return false
        const started = performance.now()
        const ok = renderer.draw(entry, frame)
        if (ok) {
            const ms = performance.now() - started
            stats.draws += 1
            stats.totalMs += ms
            stats.lastMs = ms
            stats.maxMs = Math.max(stats.maxMs, ms)
        }
        return ok
    },
    onEntriesChange: () => {
        if (rendererState === 'ready') renderer.sync(scheduler.entries())
    }
})

const loadRenderer = () => {
    if (rendererState !== 'idle') return
    rendererState = 'loading'
    import('./previewRenderer.jsx')
        .then(({ createPreviewRenderer }) => {
            renderer = createPreviewRenderer({
                onCommitted: (key) => scheduler.markDirty(key),
                onRestored: () => scheduler.markAllDirty()
            })
            rendererState = 'ready'
            renderer.sync(scheduler.entries())
            scheduler.wake()
        })
        .catch((error) => {
            // No WebGL (or a blocked context): previews stay empty black boxes
            // and the desk keeps working. Said once, not per card.
            rendererState = 'failed'
            console.warn('[cardPreview] no preview renderer on this machine:', error)
        })
}

let listening = false
const listenForVisibility = () => {
    if (listening || typeof document === 'undefined') return
    listening = true
    document.addEventListener('visibilitychange', () => scheduler.wake())
}

// Whether this page can draw previews at all. jsdom has no WebGL, and asking
// its canvas for a context logs a "Not implemented" error per card.
export const canPreview = () => typeof window !== 'undefined'
    && typeof window.WebGLRenderingContext !== 'undefined'

/** @returns { key, update(resolved), unregister() } or null */
export const registerCardPreview = (context2d) => {
    if (!context2d || !canPreview()) return null
    listenForVisibility()
    loadRenderer()
    return scheduler.register(context2d)
}

/** For a harness or the console: how much the previews cost. */
export const getCardPreviewStats = () => ({
    ...stats,
    meanMs: stats.draws ? stats.totalMs / stats.draws : 0,
    registered: scheduler.entries().length,
    renderer: rendererState
})
