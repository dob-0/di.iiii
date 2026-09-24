// DIRECTIONS COVERED — a ring of 36, filled from the compass while recording.
//
// It says ONE thing, and the label on it says exactly that thing: which way the
// camera has pointed. It is NOT coverage of the room, and must never be called
// that. A person can stand in a doorway and turn on the spot and fill every
// sector of this ring, having seen almost nothing of the hall; a person can walk
// a whole factory floor in a straight line and fill four. A reconstruction needs
// the second walk and this ring cannot tell them apart.
//
// It is still worth drawing, because the failure it DOES catch is the common
// one: a walk that never looked back. Photogrammetry matches a frame against
// its neighbours, and a hall walked once in one direction gives every wall
// exactly one viewing angle. An empty arc on the ring is a wall the
// reconstruction will have one opinion about, and one opinion is a hole.
//
// 36 sectors of 10°, because 10° is about the width of a phone's own step
// between frames at walking pace, and 36 marks are still countable at a glance
// on a 390-px screen.
//
// Heading is degrees clockwise from north, which is what both browsers hand
// over: `deviceorientationabsolute`'s alpha (counter-clockwise, so it is
// flipped by the caller) and Safari's `webkitCompassHeading` (already
// clockwise from magnetic north). Neither is trustworthy to a degree — a phone
// indoors sits inside a steel building next to its own magnets — and the ring
// does not need it to be: a wrong-by-30° heading still moves when the person
// turns, which is the only thing being counted.

export const SECTOR_COUNT = 36
export const SECTOR_DEGREES = 360 / SECTOR_COUNT

/** Which sector a heading falls in, or null when there is no heading. */
export const sectorFor = (heading) => {
    // `typeof` first, because `Number(null)` and `Number('')` are both 0 — which
    // is a real heading, due north. A refused orientation permission hands over
    // null, and reading that as north would fill the ring's first sector with
    // something nobody pointed at.
    if (typeof heading !== 'number' && typeof heading !== 'string') return null
    if (typeof heading === 'string' && heading.trim() === '') return null
    const value = Number(heading)
    if (!Number.isFinite(value)) return null
    const wrapped = ((value % 360) + 360) % 360
    return Math.floor(wrapped / SECTOR_DEGREES) % SECTOR_COUNT
}

/** A fresh ring: every sector empty. */
export const emptyRing = () => new Array(SECTOR_COUNT).fill(false)

/**
 * Mark a heading. Returns a NEW ring when something changed and the SAME ring
 * when it did not — the surface re-renders on identity, and a compass fires
 * many times a second inside one sector.
 */
export const markHeading = (ring, heading) => {
    const sectors = Array.isArray(ring) && ring.length === SECTOR_COUNT ? ring : emptyRing()
    const sector = sectorFor(heading)
    if (sector === null || sectors[sector]) return sectors
    const next = [...sectors]
    next[sector] = true
    return next
}

/** How many of the 36 have been pointed at. */
export const coveredCount = (ring) =>
    (Array.isArray(ring) ? ring : []).reduce((total, filled) => total + (filled ? 1 : 0), 0)

/**
 * The widest unvisited arc, in degrees — the one number worth a sentence on the
 * screen. Wraps, because a gap straddling north is still one gap. Returns 360
 * for an untouched ring (nothing has been pointed at, so everything is a gap)
 * and 0 for a full one.
 */
export const widestGap = (ring) => {
    const sectors = Array.isArray(ring) && ring.length === SECTOR_COUNT ? ring : emptyRing()
    const covered = coveredCount(sectors)
    if (covered === 0) return 360
    if (covered === SECTOR_COUNT) return 0
    let worst = 0
    let run = 0
    // Twice round: a run that starts before north and ends after it is counted
    // whole on the second lap, and no run can be longer than the ring itself.
    for (let step = 0; step < SECTOR_COUNT * 2; step += 1) {
        if (sectors[step % SECTOR_COUNT]) {
            run = 0
        } else {
            run += 1
            if (run > worst) worst = run
        }
    }
    return Math.min(SECTOR_COUNT, worst) * SECTOR_DEGREES
}

/**
 * What to say about the ring. Honest wording only: "directions covered", and a
 * gap named as a direction not looked, never as a part of the room not seen.
 */
export const ringReading = (ring) => {
    const covered = coveredCount(ring)
    const gap = widestGap(ring)
    return {
        covered,
        total: SECTOR_COUNT,
        gap,
        // One sentence, or none. A gap under 60° is narrower than the camera's
        // own field of view and there is nothing to do about it.
        hint: covered === 0 ? '' : (gap >= 60 ? `turn — ${Math.round(gap)}° never looked at` : '')
    }
}
