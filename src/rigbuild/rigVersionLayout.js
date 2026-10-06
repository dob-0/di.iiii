// Where the rig's version row and the show chip sit at the top of a published room.
//
// The row (RigVersionSwitch) is anchored top-left; the room's own controls (Walk / Fly,
// Sound) are anchored top-right on the same line. On a laptop or a landscape phone both
// fit side by side. On a portrait phone they do not: at 390 px the four version links
// (~330 px) ran under Walk / Fly, leaving "ly" of it showing (measured on
// dev.diiii.xyz/moxir, 2026-09-29). So on a compact phone, when a right-hand control is
// there, the row takes a line of its own under that control line, and the show chip
// moves down one more line. Everything else keeps the layout it had.

// One control line: a 44 px tap target plus the gap to the next line.
export const CONTROL_LINE = '56px'

/**
 * @param {string}  topClear        what the room's corner controls clear at the top (CSS length)
 * @param {object}  flags
 * @param {boolean} flags.rowShown       the version row is on screen
 * @param {boolean} flags.compact        a phone-width viewport (useViewportMode().isPhoneCompact)
 * @param {boolean} flags.rightControls  Walk / Fly or Sound is on the top-right of the same line
 * @returns {{ rowTop: string, chipTop: string }}
 */
export function rigChromeTops(topClear, { rowShown = false, compact = false, rightControls = false } = {}) {
    if (!rowShown) return { rowTop: topClear, chipTop: topClear }
    const rowTop = compact && rightControls ? `calc(${topClear} + ${CONTROL_LINE})` : topClear
    return { rowTop, chipTop: `calc(${rowTop} + ${CONTROL_LINE})` }
}

// In walk mode the room's own header (exit, title, sound, badge) is the first line and the
// joystick, Fly and altitude buttons live at the bottom, so the version control takes the
// free line UNDER the header, top-left, collapsed to one 44 px button. 4.5rem is the header
// (20 px padding + a 40 px button) plus a gap; measured on no real screen yet.
export const WALK_HEADER_CLEAR = '4.5rem'

/**
 * Which version control a viewer shows, and where.
 * @returns {{ mode: 'row'|'walk'|null, top: string }}
 */
export function rigVersionPlacement(topClear, { isRigSet = false, navMode = 'orbit', rowTop = topClear } = {}) {
    if (!isRigSet) return { mode: null, top: topClear }
    if (navMode === 'walk') return { mode: 'walk', top: `calc(${topClear} + ${WALK_HEADER_CLEAR})` }
    return { mode: 'row', top: rowTop }
}

// How wide the version row may grow. Walk / Fly is anchored top-right (right 1rem, about 7.7rem
// wide) and Sound, where the room has sound, left of it (right 9.5rem, about 6.5rem wide), on the
// row's own line. Capped at the window width the row ran under them: with ten live versions it was
// 2216 px wide and covered Walk / Fly on a 1568 px window (owner: "where are the walk / fly",
// 2026-09-30). On a compact phone the row already takes a line of its own (rigChromeTops).
export function rigRowMaxWidth({ compact = false, walk = false, sound = false } = {}) {
    const ownLine = compact && (walk || sound)
    if (ownLine || (!walk && !sound)) return 'calc(100vw - 2rem)'
    // the row's own 1rem left margin + the controls' width + a gap
    const reserve = walk && sound ? '18.5rem' : walk ? '10.5rem' : '10rem'
    return `calc(100vw - ${reserve})`
}
