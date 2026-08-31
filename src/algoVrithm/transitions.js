import { sortByStart } from '../timeline/editList.js'

// Handovers between sequences, and how hard to veil them.
//
// WHY A CROSS-FADE IS NOT ENOUGH IN A HEADSET.
//
// The piece already overlaps its clips and fades each one on its own envelope,
// which on a monitor reads as a dissolve. In VR it does not. A dissolve puts
// two complete worlds in front of you at once, both semi-transparent, and
// stereo vision tries to resolve BOTH at their own depths simultaneously. Your
// eyes cannot converge on two things at the same time, so a mid-dissolve is not
// a soft transition — it is a double exposure that reads as a glitch, and on a
// long one it is genuinely uncomfortable.
//
// What film does instead, and what VR has to do, is fade through something.
// Dipping the whole view toward a flat colour at the moment of handover gives
// the eyes a single surface at a single depth to rest on for a beat, and hides
// the double exposure behind it. It is the difference between two scenes
// smearing through each other and one scene becoming another.
//
// FADE TO THE ROOM COLOUR, NOT TO BLACK. A black dip inside the white tunnel is
// a blink — a hard luminance drop that draws attention to itself, and in a
// headset feels like the display cutting out. Veiling toward whatever colour
// the room already is keeps luminance continuous, so the transition registers
// as the world briefly losing detail rather than as a cut. See TransitionVeil.

/**
 * How opaque the veil gets at the centre of a handover.
 *
 * Deliberately short of 1. A full white-out is a scene change you WATCH, and
 * three of them in a thirty-second piece turns the work into a slideshow. At
 * this strength the outgoing scene is still faintly there — enough that the
 * handover feels continuous, opaque enough to kill the double image.
 */
export const VEIL_PEAK = 0.72

/**
 * Fraction of the overlap the veil is actually up for.
 *
 * Less than the whole overlap on purpose: the veil should be at its thickest
 * only around the crossing point, and be gone before the incoming sequence has
 * finished fading in, or the new scene appears to arrive already in progress.
 */
export const VEIL_SPAN = 0.8

const smoothstep = (edge0, edge1, value) => {
    if (edge0 === edge1) return value >= edge1 ? 1 : 0
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

/**
 * Where one sequence hands over to the next, and how long it has to do it.
 *
 * A handover is the OVERLAP between consecutive clips — not a clip boundary.
 * Boundaries come in pairs (one ends at 7.2 while the next started at 4.95) and
 * veiling at each of them separately would produce two dips per transition.
 * The crossing point is the middle of the overlap.
 *
 * Clips that merely touch, or that leave a gap, still get a handover: a hard
 * cut is exactly the case that most needs covering, and the edit list is
 * allowed to contain one.
 */
export const handovers = (sequences = []) => {
    const ordered = sortByStart(sequences.filter((sequence) => sequence?.backdrop))
    const result = []

    for (let index = 1; index < ordered.length; index++) {
        const previous = ordered[index - 1]
        const current = ordered[index]

        // A row can declare `veil: false`: its arrival IS the transition, and
        // the veil would sit on top of it. The reel globe is the case this
        // exists for — it arrives through a portal the metaball field opens,
        // and dipping the view 72% toward grey at the exact moment the hole
        // reveals the footage buries the one choreographed reveal the piece
        // has under the generic cover. The flag lives on the INCOMING row
        // because the arrival is what the transition belongs to.
        if (current.veil === false) continue

        const overlapStart = current.startSec
        const overlapEnd = previous.endSec
        const overlap = overlapEnd - overlapStart

        if (overlap > 0) {
            result.push({
                atSec: (overlapStart + overlapEnd) / 2,
                // Half-width of the dip. Scaled off the overlap so a long,
                // luxurious dissolve gets a long veil and a tight one does not
                // get a veil wider than the transition it is covering.
                halfWidthSec: Math.max(0.25, (overlap * VEIL_SPAN) / 2),
                isCut: false
            })
        } else {
            // A butt-cut or a gap. There is no overlap to hide inside, so the
            // veil supplies the transition rather than covering one — and it
            // needs a real duration of its own to do that.
            result.push({
                atSec: overlapStart,
                halfWidthSec: 0.5,
                isCut: true
            })
        }
    }

    return result
}

/**
 * Veil opacity at `playheadSec` — 0 anywhere that is not a handover.
 *
 * Takes the strongest of the overlapping dips rather than summing them, so two
 * handovers close together cannot stack into an opaque wall.
 */
export const veilAmount = (sequences = [], playheadSec = 0, peak = VEIL_PEAK) => {
    let strongest = 0

    for (const { atSec, halfWidthSec } of handovers(sequences)) {
        const distance = Math.abs(playheadSec - atSec)
        if (distance >= halfWidthSec) continue
        // 1 at the crossing, easing to 0 at the edges. Smoothstep rather than a
        // linear ramp: the veil arriving and leaving at constant speed reads as
        // a wipe, which is a transition of its own rather than a cover for one.
        strongest = Math.max(strongest, 1 - smoothstep(0, halfWidthSec, distance))
    }

    return strongest * peak
}

/**
 * The piece's own opening and closing fades.
 *
 * Separate from handovers because they are not covering anything — they are the
 * piece starting and ending. Mounting straight into a lit scene, or cutting to
 * a dead canvas at the end, is abrupt on a monitor and startling in a headset.
 */
export const bookendAmount = (durationSec, playheadSec, fadeSec = 0.9) => {
    if (!(durationSec > 0)) return 0
    const inAmount = 1 - smoothstep(0, fadeSec, playheadSec)
    const outAmount = smoothstep(durationSec - fadeSec, durationSec, playheadSec)
    return Math.max(inAmount, outAmount)
}

/** Everything the veil should be doing right now, in one number. */
export const totalVeil = (sequences, playheadSec, durationSec) => Math.min(
    1,
    Math.max(
        veilAmount(sequences, playheadSec),
        bookendAmount(durationSec, playheadSec)
    )
)
