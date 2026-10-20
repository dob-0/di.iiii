// How many lines a piece of text takes when the browser wraps it in a box of a
// given width. The card geometry needs this BEFORE the card is drawn (the box
// decides where the next card goes and where wires land), so it cannot read
// the drawn height back from the DOM.
//
// Method: the browser's own text metrics (CanvasRenderingContext2D.measureText,
// WHATWG HTML §4.12.5) with the same font the card draws in, and the same
// greedy break the CSS uses for `white-space: normal; overflow-wrap: anywhere`
// — break at spaces, and inside a word only when the word alone is wider than
// the line. Where there is no canvas (tests in jsdom, a worker without
// OffscreenCanvas) it falls back to an average character width, which is
// deterministic but approximate; callers clamp the drawn lines to the count,
// so a wrong guess shows an ellipsis, never text over the next card.

let context

const getContext = () => {
    if (context !== undefined) return context
    context = null
    try {
        // jsdom implements <canvas> without a 2D context and logs "Not
        // implemented" for every call — use the fallback there.
        if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) return context
        const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(1, 1)
            : (typeof document !== 'undefined' ? document.createElement('canvas') : null)
        context = canvas?.getContext?.('2d') || null
    } catch {
        context = null
    }
    return context
}

// Average glyph width as a share of the font size, used only without a canvas.
const FALLBACK_CHAR_EM = 0.56

const widthOf = (text, font, fontSize) => {
    const ctx = getContext()
    if (!ctx) return text.length * fontSize * FALLBACK_CHAR_EM
    if (ctx.font !== font) ctx.font = font
    return ctx.measureText(text).width
}

// Characters of `word` that fit in `width` (at least one, so a single glyph
// wider than the box still advances).
const fitChars = (word, width, font, fontSize) => {
    let n = 1
    while (n < word.length && widthOf(word.slice(0, n + 1), font, fontSize) <= width) n += 1
    return n
}

// cardHeight runs for every card on every render; the same rows come back
// each time. Bounded so a long session cannot grow it without limit.
const cache = new Map()
const CACHE_LIMIT = 2000
// Counts taken before the card font arrived were measured in a fallback font.
try {
    globalThis.document?.fonts?.addEventListener?.('loadingdone', () => cache.clear())
} catch { /* no FontFaceSet: nothing to invalidate */ }

export const countWrappedLines = (text, options) => {
    const key = `${options.font}|${options.width}|${text}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const lines = countLines(text, options)
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value)
    cache.set(key, lines)
    return lines
}

const countLines = (text, { width, font, fontSize }) => {
    const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
    if (!words.length || !(width > 0)) return 1
    let lines = 1
    let current = ''
    for (let word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (widthOf(candidate, font, fontSize) <= width) {
            current = candidate
            continue
        }
        if (current) {
            lines += 1
            current = ''
        }
        // A word wider than the whole line breaks anywhere (overflow-wrap: anywhere).
        while (widthOf(word, font, fontSize) > width) {
            word = word.slice(fitChars(word, width, font, fontSize))
            lines += 1
        }
        current = word
    }
    return lines
}
