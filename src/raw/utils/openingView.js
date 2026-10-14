// The view a canvas opens in (audit 2026-10-05 §3.7, row 7): FIT-TO-WIDTH,
// top-left aligned with a 24px pad, never magnified past 100%. The slack goes
// at the bottom — never above the first card; a project taller than the window
// continues below it (pan or scroll), its cards at a size that can be read.
// Fit (H, `everything`) is the overview: every card in view, width and height. One pure
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
// Measured choice (2026-10-07, 390x844): at 50 % a card's body text is
// 13 * 0.5 = 6.5 px and the card is a tall, mostly empty box (summary tier).
// At 11/13 (= 0.846, the zoom where the full tier starts) the text is the
// 11 px the token scale allows as its smallest, a card is ~170 px wide, so one
// card reads whole with the next peeking in — a finger pans to the rest.
// `OPENING_PHONE_FLOOR` is what a phone opens at; set it back to
// OPENING_SUMMARY_FLOOR for the 50 % opening.
export const OPENING_PHONE_FLOOR = 11 / 13

/**
 * @param bounds `{minX, minY, width, height}` of everything to show, graph units
 * @param box    the visible band: `{freeLeft, freeTop, freeRight, freeBottom}`, px
 * @returns `{ zoom, panX, panY }`
 */
// `everything`: the person asked to see it all (Fit, H) — the narrow rule is for
// the OPENING view only.
export const openingView = ({ bounds, box, everything = false, surfaceWidth, minZoom = 0.1, maxZoom = 4 }) => {
    const bandWidth = Math.max(1, (box.freeRight - box.freeLeft) - OPENING_PAD * 2)
    const bandHeight = Math.max(1, (box.freeBottom - box.freeTop) - OPENING_PAD * 2)
    const widthFit = bandWidth / Math.max(1, bounds.width)
    const heightFit = bandHeight / Math.max(1, bounds.height)
    // A phone is a narrow SURFACE; a wide one with a window docked beside the
    // canvas has a narrow free band but is not a phone.
    const narrow = (surfaceWidth ?? (box.freeRight - box.freeLeft)) < OPENING_NARROW_WIDTH
    const widthView = Math.min(widthFit, OPENING_MAX_ZOOM)
    const wanted = everything
        ? Math.min(widthFit, heightFit, OPENING_MAX_ZOOM)
        : narrow ? Math.max(widthView, OPENING_PHONE_FLOOR) : widthView
    const zoom = Math.min(Math.max(wanted, minZoom), maxZoom)
    return {
        zoom,
        panX: box.freeLeft + OPENING_PAD - bounds.minX * zoom,
        panY: box.freeTop + OPENING_PAD - bounds.minY * zoom
    }
}
