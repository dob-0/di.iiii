// THE STROBE RATE CAP — one number, every path clamps to it. Pure.
//
// The owner's rule for these shows: a photosensitivity limit of at most 3 flashes per second
// in any look. Reference point: the widely used "no more than three flashes in any one second"
// threshold for photosensitive epilepsy (WCAG 2.x SC 2.3.1 "Three Flashes or Below Threshold";
// ITU-R BT.1702 for broadcast). UNVERIFIED here: the clause wording was recalled from memory,
// not read from the documents (neither is in this repo) — check the text before quoting it.
// TODO (owed, NOT built): an explicit override for a venue with a signed waiver.

export const MAX_STROBE_HZ = 3

/** A requested rate as the rate that may be played: [0, MAX_STROBE_HZ]; junk is 0. */
export const capStrobeHz = (hz) => {
    const n = Number(hz)
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_STROBE_HZ, n) : 0
}

/** A look's strobe rate: its own strobeHz clamped; none stated = the cap (was a fixed 10). */
export const lookStrobeHz = (look) => (look && look.strobeHz != null && Number.isFinite(Number(look.strobeHz)) ? capStrobeHz(look.strobeHz) : MAX_STROBE_HZ)
