// Where the rig's version row and the show chip sit at the top of a published room.
//
// The row (RigVersionSwitch) is anchored top-left; the room's own controls (Walk / Fly,
// Sound) are anchored top-right on the same line. On a laptop or a landscape phone both
// fit side by side. On a portrait phone they do not: at 390 px the four version links
// (~330 px) ran under Walk / Fly, leaving "ly" of it showing (measured on
// dev.diiii.xyz/moxir, 2026-09-29). So on a compact phone, when a right-hand control is
// there, the row takes a line of its own under that control line, and the show chip
// moves down one more line. Everything else keeps the layout it had.
//
// 2026-10-08 (owner, on his phone at dev.diiii.xyz/moxir/v1-0: "in mobile ui things is overlap"): the
// right-hand column grew to three stacked controls (Walk / Fly, Inside, Lite), so "its own line under
// Walk / Fly" was line 2, under Inside, and the show chip on line 3 ran under Lite (measured at 384x832:
// the row and the chip each covered the column by 72x41 px). On a compact phone the row and the chip now
// start under the WHOLE column; on a wider window the chip, like the row, stops before the column.

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
export function rigChromeTops(topClear, { rowShown = false, compact = false, rightControls = false, rightLines = 1 } = {}) {
    const lines = Math.max(1, Number(rightLines) || 1)
    const under = !(compact && rightControls) ? topClear
        : lines === 1 ? `calc(${topClear} + ${CONTROL_LINE})` : `calc(${topClear} + ${lines} * ${CONTROL_LINE})`
    // with no row the chip is the first thing on the left, so on a phone it too starts under the column
    if (!rowShown) return { rowTop: topClear, chipTop: under }
    return { rowTop: under, chipTop: `calc(${under} + ${CONTROL_LINE})` }
}

/**
 * How many control lines the room's top-right column holds: Walk / Fly (Sound beside it), Inside
 * where the room has a building, then Lite / Full — the three are drawn in PublicProjectViewer only
 * together with Walk / Fly. Without Walk / Fly, Sound alone is one line.
 */
export function rigRightColumnLines({ walk = false, building = false, sound = false } = {}) {
    if (walk) return building ? 3 : 2
    return sound ? 1 : 0
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

// How wide the show chip may grow. On a compact phone it sits under the whole right column
// (rigChromeTops), so it has the full width. Elsewhere it never reaches the column: with no row it is
// on the top line, beside Walk / Fly and Sound (the row's own rule); under a row it is on line 2,
// beside Inside / Lite, which stand where Walk / Fly stands.
export function rigChipMaxWidth({ compact = false, walk = false, sound = false, rowShown = false } = {}) {
    if (compact && (walk || sound)) return 'calc(100vw - 2rem)'
    if (!rowShown) return rigRowMaxWidth({ compact, walk, sound })
    return walk ? 'calc(100vw - 10.5rem)' : 'calc(100vw - 2rem)'
}
