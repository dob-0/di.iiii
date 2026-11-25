// Ctrl/Cmd+C and Ctrl/Cmd+V on the mapping desk.
//
// A copied surface travels as text on the system clipboard, marked so a paste
// can tell it from any other text. That is what lets a surface copied in one
// project's tab land in another's — her own mapping and the venue's are
// usually two projects open side by side.

export const SURFACE_CLIPBOARD_KIND = 'di.iiii/mapping-surface'

// How far each paste moves down and right, in output widths/heights: enough to
// see the copy is its own thing rather than hiding exactly over the original.
export const PASTE_OFFSET = 0.02

export function surfaceToClipboardText(surface) {
    return JSON.stringify({ kind: SURFACE_CLIPBOARD_KIND, surface })
}

const isPoint = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)

// Null for anything that is not a surface we wrote, so pasting a sentence over
// the desk does nothing. Corners are checked as [x, y] number pairs: a surface
// whose corners arrive as anything else is reset to the default box by the
// document, which would paste a surface somewhere nobody put it.
export function surfaceFromClipboardText(text) {
    if (typeof text !== 'string' || !text.includes(SURFACE_CLIPBOARD_KIND)) return null
    let parsed = null
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }
    const surface = parsed?.kind === SURFACE_CLIPBOARD_KIND ? parsed.surface : null
    if (!surface || !Array.isArray(surface.corners) || surface.corners.length !== 4 || !surface.corners.every(isPoint)) return null
    return surface
}

// The surface the nth paste of `surface` makes. Each paste steps one offset
// further, so Ctrl+V three times fans out three copies instead of stacking
// them. The id is left out: the document gives the copy its own.
export function pastedSurface(surface, nth = 1) {
    const { id: _id, ...rest } = surface
    const offset = PASTE_OFFSET * nth
    return {
        ...rest,
        name: `${surface.name || surface.id || 'Surface'} copy`,
        corners: surface.corners.map(([x, y]) => [x + offset, y + offset])
    }
}
