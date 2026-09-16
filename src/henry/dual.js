// The reveal, as data.
//
// The piece has exactly one trick and this file is it: every giant dream
// object and the ordinary object it "turns out to be" are THE SAME MESH at two
// scales. The reveal is not a cut, a crossfade, or a second scene — it is
// `lerp(dreamScale, realScale, 1 - dream)` on one object, played over four
// seconds while the camera pulls back.
//
// That is why the girl never changes size (GIRL_HEIGHT below). Scale is
// relative, so shrinking the world around a fixed girl and growing the girl
// inside a fixed world are the same picture — and the fixed girl is the one
// that keeps her animation, her collider and her camera rig all in one unit
// system for the whole piece. Nothing about her needs a special case at 1:25.
//
// The pairs also carry a `becomes` label. It is never displayed; it exists so
// that anyone reading this file can see the joke, and so that a pair whose two
// halves have drifted into unrelated shapes is obvious on inspection.

/** A small child, in world units = metres. The one fixed thing in the piece. */
export const GIRL_HEIGHT = 1.2

/**
 * Roughly how much bigger the dream is. Not used as a multiplier — every pair
 * states both scales outright — but it is the number the pairs were authored
 * against, and a new pair that lands far from it will look wrong beside them.
 */
export const DREAM_MAGNIFICATION = 35

/**
 * The pairs. `position` is where the object sits in the REAL room; the dream
 * uses `dreamPosition` when the giant version needs to sit somewhere else for
 * the composition to work (a flower she can walk under is not directly on top
 * of the pot it came from).
 *
 * Both halves are the same component, so `kind` picks the component and the
 * two scales do the rest.
 */
export const PAIRS = [
    {
        id: 'plant-a',
        kind: 'flower',
        becomes: 'the big houseplant by the window',
        position: [-2.1, 0, -1.4],
        dreamPosition: [-14, 0, -9],
        realScale: 0.95,
        dreamScale: 33,
        realRotationY: 0.3
    },
    {
        id: 'plant-b',
        kind: 'flower',
        becomes: 'the smaller plant on the floor',
        position: [2.4, 0, -2.2],
        dreamPosition: [16, 0, -15],
        realScale: 0.62,
        dreamScale: 22,
        realRotationY: -0.8
    },
    {
        id: 'tree',
        kind: 'tree',
        becomes: 'the standing lamp in the corner',
        position: [-3.4, 0, -4.2],
        dreamPosition: [-6, 0, -46],
        realScale: 1.0,
        dreamScale: 30
    },
    {
        id: 'bear',
        kind: 'bear',
        becomes: 'her plush bear, arm-sized, on the rug',
        position: [0.85, 0, 0.55],
        dreamPosition: [22, 0, -74],
        realScale: 0.42,
        dreamScale: 26,
        realRotationY: -0.45
    },
    {
        id: 'sofa',
        kind: 'rock',
        becomes: 'the sofa she is leaning against',
        position: [0, 0, -3.1],
        dreamPosition: [-30, 0, -30],
        realScale: 1.0,
        dreamScale: 18
    }
]

export const pairById = (id) => PAIRS.find((pair) => pair.id === id) ?? null

/** Linear is correct here — the easing already happened in dreamAmount. */
const mix = (a, b, t) => a + (b - a) * t

/**
 * The transform an object should have right now. `dream` is 1 at the start of
 * the piece and 0 once the glasses are off.
 *
 * Scale interpolates in LOG space. A 0.95-to-33 range crossed linearly spends
 * almost the whole transition enormous and then collapses in the last few
 * frames; crossed logarithmically it shrinks at a constant *rate*, which is
 * what "the room is coming back" actually looks like.
 */
export const resolvePairTransform = (pair, dream) => {
    const t = Math.min(1, Math.max(0, dream))
    const from = pair.dreamPosition ?? pair.position
    const logScale = mix(Math.log(pair.realScale), Math.log(pair.dreamScale), t)
    return {
        position: [
            mix(pair.position[0], from[0], t),
            mix(pair.position[1], from[1], t),
            mix(pair.position[2], from[2], t)
        ],
        rotationY: mix(pair.realRotationY ?? 0, 0, t),
        scale: Math.exp(logScale)
    }
}
