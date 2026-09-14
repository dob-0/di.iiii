// How a visitor goes THROUGH a door — the decisions, with nothing drawn.
//
// Owner, 2026-09-14: "there are no animation where we go inside", and of the
// effects the facade already had, "it feels too cracky and DIY — can we make
// it all pro?". Clicking a door gave ~450 ms of black with a spinner and then
// a hard cut. The register asked for is a film one: one continuous eased move,
// the whole field, restrained, and never a glitch.
//
// Three candidates stood side by side (a glide, a dissolve through the
// door's colour, a panel opening out of the door) and the owner found them
// "the same" (2026-09-15). There is ONE entering move now, the glide:
//
//   the camera travels into the door; the last frame holds and keeps
//   drifting forward until the destination has painted, then the destination
//   fades up in its place. A door with no room behind it (a button on the
//   front page, a card on /spaces) pushes the view gently toward the thing
//   pressed instead.
//
// Everything that is a DECISION lives here, pure, so it can be asserted on
// without a canvas or a timer. A visitor who asked the system for less motion
// gets a short plain fade, and the same destination.

// The ground of the brand. A card has no colour of its own, and a door's
// colour at full strength is a flash, not a field.
export const ENTRY_GROUND = '#05070a'

const readSearch = (search) => {
    if (typeof search === 'string') return search
    if (typeof window === 'undefined') return ''
    return window.location.search || ''
}

// `?entryslow=<factor>` stretches every authored duration so a move can be
// looked at frame by frame — the same opt-in shape as the landing's
// `?flight=<ms>`. Waiting for the destination is real time and is not
// stretched: that part is not ours to slow down.
export const resolveEntrySlowdown = (search) => {
    const asked = Number(new URLSearchParams(readSearch(search)).get('entryslow'))
    return Number.isFinite(asked) && asked >= 1 && asked <= 40 ? asked : 1
}

export const prefersReducedMotion = (win = typeof window === 'undefined' ? null : window) => Boolean(
    win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
)

// Not the same play twice (the motion rule that survived the correction), but
// the variation is subtle: timing and depth move by a few percent, never the
// kind of move. `random` is injectable so a test can pin it.
const varied = (ms, random, spread = 0.08) => ms * (1 + (random() * 2 - 1) * spread)

/**
 * @param {object}  options
 * @param {boolean} [options.reducedMotion]
 * @param {boolean} [options.hasScene]    the source is a door in a live 3D room
 * @param {number}  [options.slow]        ?entryslow factor
 * @param {Function}[options.random]
 */
export const planEntry = ({ reducedMotion = false, hasScene = false, slow = 1, random = Math.random } = {}) => {
    const s = Number.isFinite(slow) && slow >= 1 ? slow : 1
    if (reducedMotion) {
        return {
            kind: 'fade',
            glideMs: 0,
            glideReach: 0,
            coverMs: hasScene ? 0 : Math.round(160 * s),
            leadMs: 0,
            revealMs: Math.round(240 * s),
            driftScale: 1,
            driftMs: 0,
            settleFrom: 1,
            settleMs: 0
        }
    }
    return {
        kind: 'glide',
        glideMs: hasScene ? Math.round(varied(1150, random) * s) : 0,
        glideReach: hasScene ? 1 : 0,
        // Without a room to travel through and without a picture of the page
        // to hold (a card), the page itself is pushed toward the thing pressed
        // while the ground comes up.
        coverMs: hasScene ? 0 : Math.round(varied(640, random) * s),
        // Holding a picture of the page instead (a front-page button), the push
        // is already under way when the route changes, and the destination is
        // not let up before the push has read as a move rather than a flicker.
        leadMs: hasScene ? 0 : Math.round(varied(560, random) * s),
        revealMs: Math.round(varied(900, random) * s),
        driftScale: 1.07 + random() * 0.03,
        driftMs: Math.round(2600 * s),
        settleFrom: 1.035 + random() * 0.01,
        settleMs: Math.round(varied(1400, random) * s)
    }
}

const parseHex = (hex) => {
    const raw = String(hex || '').trim().replace(/^#/, '')
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
    if (!/^[0-9a-f]{6}$/i.test(full)) return null
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

// A door's colour as a field, not as a flash: mixed down into the ground so a
// white or a saturated red reads as a tint of the dark it opens onto.
export const entryTone = (hex, strength = 0.32) => {
    const colour = parseHex(hex)
    const ground = parseHex(ENTRY_GROUND)
    if (!colour) return ENTRY_GROUND
    const k = Math.min(1, Math.max(0, strength))
    const mixed = colour.map((c, i) => Math.round(ground[i] + (c - ground[i]) * k))
    return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// The destination has painted when the app's one loading screen is gone and a
// surface that draws is in the document which was NOT there before we left —
// the page being left behind has canvases and iframes of its own (the landing
// room, the space cards' previews), and counting those would reveal a frame
// of the old page over nothing.
//
// Two ways a surface can be there and still show nothing yet:
//   - a room's loading veil stays in the DOM once the room has loaded, faded
//     to opacity 0 — present is not the same as showing;
//   - a room's canvas draws its first frames before its document arrives, in
//     the default dark and with nothing in it. A scene marks itself
//     `data-entry-pending` until then, and a surface inside that mark does
//     not count (seen on /open_jam/scene: its white room came up out of a
//     dark empty frame).
export const ENTRY_PENDING_ATTR = 'data-entry-pending'

export const isShowing = (el) => {
    const view = el.ownerDocument?.defaultView
    if (!view?.getComputedStyle) return true
    const style = view.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const opacity = Number.parseFloat(style.opacity)
    return !(Number.isFinite(opacity) && opacity <= 0.05)
}

export const isDestinationPainted = (doc, { before = new Set(), curtain = null } = {}) => {
    if (!doc) return false
    const loading = Array.from(doc.querySelectorAll('.loading-screen, .live-scene-loading'))
        .filter((el) => !(curtain && curtain.contains(el)))
    if (loading.some(isShowing)) return false
    const drawn = Array.from(doc.querySelectorAll('canvas, iframe'))
        .filter((el) => !before.has(el) && !(curtain && curtain.contains(el)) && !el.closest(`[${ENTRY_PENDING_ATTR}]`))
    return drawn.length > 0
}

// A destination with nothing to draw (a text page, a work's landing) never
// satisfies the check above; once the loading screen has been gone this long
// it is as painted as it is going to be.
export const QUIET_PAINT_MS = 900
// However long the destination takes, the curtain never outstays this.
export const PAINT_BACKSTOP_MS = 6000
// A canvas is inserted a frame before its renderer draws into it.
export const PAINT_STABLE_FRAMES = 3
