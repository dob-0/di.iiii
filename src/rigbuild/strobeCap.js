// THE STROBE RATE CAP — one number, every path clamps to it. Pure.
//
// The owner's rule for these shows: a photosensitivity limit of at most 3 flashes per second
// in any look. Reference point: the widely used "no more than three flashes in any one second"
// threshold for photosensitive epilepsy (WCAG 2.x SC 2.3.1 "Three Flashes or Below Threshold";
// ITU-R BT.1702 for broadcast). UNVERIFIED here: the clause wording was recalled from memory,
// not read from the documents (neither is in this repo) — check the text before quoting it.
// SINCE 2026-11-27 (owner N7618, "i dont want any limits") the cap is the desk setting output.strobeLimit, OFF by default:
// off = no clamp (what the rig does is what the preview shows); on = the 3 Hz clamp as before. The desk's state feeds
// setStrobeLimit (rigMirror/useLightingMirror.js); same switch as serverXR/src/lighting.

export const MAX_STROBE_HZ = 3

let limited = false
/** The desk setting output.strobeLimit (false = no cap). */
export const setStrobeLimit = (on) => { limited = !!on }
export const strobeLimited = () => limited

/** A requested rate as the rate that may be played: [0, MAX_STROBE_HZ] with the limit on, any rate >= 0 with it off; junk is 0. */
export const capStrobeHz = (hz) => {
    const n = Number(hz)
    return Number.isFinite(n) && n > 0 ? (limited ? Math.min(MAX_STROBE_HZ, n) : n) : 0
}

/** A look's strobe rate: its own strobeHz clamped; none stated = the cap (was a fixed 10). */
export const lookStrobeHz = (look) => (look && look.strobeHz != null && Number.isFinite(Number(look.strobeHz)) ? capStrobeHz(look.strobeHz) : MAX_STROBE_HZ)
