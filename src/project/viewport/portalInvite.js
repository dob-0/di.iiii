// A door that invites (`reference.invite: true`, owner 2026-10-25: "arrows or something showing come here or click
// me"): a ripple spreads out from the ring, and arrows on both sides slide in toward it. No words: the door's name
// is still the reward for walking up to it (labelRevealTarget). Colour is the door's own. Pure, so it is tested.

export const INVITE = {
    period: 2.4, // s, one ripple and one arrow slide
    ripples: 2, // staggered by half a period
    rippleGrow: 0.55, // the ring's radius grows by this share before it is gone
    rippleOpacity: 0.55,
    arrowFrom: 2.15, // arrow distance from the centre, in ring radii... start
    arrowTo: 1.55, // ...and end, just outside the ring
    arrowOpacity: 0.9
}

// Where everything is at time `t` (seconds). `still` (prefers-reduced-motion): no motion, the arrows rest
// near the ring and one ripple stands still, faint, so the cue is there without moving.
export function inviteFrame(t, { still = false } = {}) {
    if (still) {
        return {
            ripples: [{ scale: 1 + INVITE.rippleGrow * 0.35, opacity: INVITE.rippleOpacity * 0.5 }],
            arrow: { distance: INVITE.arrowTo + 0.15, opacity: INVITE.arrowOpacity }
        }
    }
    const ripples = []
    for (let i = 0; i < INVITE.ripples; i += 1) {
        const phase = (((t / INVITE.period) + i / INVITE.ripples) % 1 + 1) % 1
        ripples.push({ scale: 1 + INVITE.rippleGrow * phase, opacity: INVITE.rippleOpacity * (1 - phase) })
    }
    const p = ((t / INVITE.period) % 1 + 1) % 1
    const ease = 1 - (1 - p) ** 3 // fast in, settles at the ring
    const fade = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1
    return {
        ripples,
        arrow: { distance: INVITE.arrowFrom + (INVITE.arrowTo - INVITE.arrowFrom) * ease, opacity: INVITE.arrowOpacity * fade }
    }
}

// The arrow's outline: a chevron pointing toward +x (the ring sits on the -x side of it), as [x, y] points. Pure.
export function chevronPoints(size = 0.42, thickness = 0.14) {
    const h = size / 2
    return [[-h * 0.6, h], [0, 0], [-h * 0.6, -h], [-h * 0.6 + thickness, -h], [thickness, 0], [-h * 0.6 + thickness, h]]
}
