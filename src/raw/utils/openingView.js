// The view a canvas opens in (audit 2026-10-05 §3.7, row 7): every card in
// view, top-left aligned with a 24px pad, never magnified past 100%. The slack
// goes at the bottom and the right — never above the first card. One pure
// function, so the same cards in the same box give the same view on every
// load, and a test can say so.
//
// Legibility is not this function's job. A fit that shows everything shows
// small cards; the card itself answers with fewer words (semantic zoom,
// `lodTierForZoom`), not the fit with a floor and "showing 3 of 5".

export const OPENING_PAD = 24
export const OPENING_MAX_ZOOM = 1
// Under this width the box is a phone's: fit to the WIDTH (a finger scrolls
// down), but never below the summary tier, so a long project does not open
// as a smear.
export const OPENING_NARROW_WIDTH = 700
export const OPENING_SUMMARY_FLOOR = 0.5

/**
 * @param bounds `{minX, minY, width, height}` of everything to show, graph units
 * @param box    the visible band: `{freeLeft, freeTop, freeRight, freeBottom}`, px
 * @returns `{ zoom, panX, panY }`
 */
// `everything`: the person asked to see it all (Fit, H) — the narrow rule is for
// the OPENING view only.
export const openingView = ({ bounds, box, everything = false, minZoom = 0.1, maxZoom = 4 }) => {
    const bandWidth = Math.max(1, (box.freeRight - box.freeLeft) - OPENING_PAD * 2)
    const bandHeight = Math.max(1, (box.freeBottom - box.freeTop) - OPENING_PAD * 2)
    const widthFit = bandWidth / Math.max(1, bounds.width)
    const heightFit = bandHeight / Math.max(1, bounds.height)
    const narrow = !everything && (box.freeRight - box.freeLeft) < OPENING_NARROW_WIDTH
    const wanted = narrow
        ? Math.max(Math.min(widthFit, OPENING_MAX_ZOOM), OPENING_SUMMARY_FLOOR)
        : Math.min(widthFit, heightFit, OPENING_MAX_ZOOM)
    const zoom = Math.min(Math.max(wanted, minZoom), maxZoom)
    return {
        zoom,
        panX: box.freeLeft + OPENING_PAD - bounds.minX * zoom,
        panY: box.freeTop + OPENING_PAD - bounds.minY * zoom
    }
}
