import { describe, expect, it } from 'vitest'
import {
    MOUTH_FAR,
    THROAT_DEPTH,
    TUNNEL_AHEAD,
    TUNNEL_BEHIND,
    TUNNEL_LENGTH
} from './WhiteTunnel.jsx'
import { BACKDROPS } from '../palette.js'

// The tunnel's geometry and the room's fog are two separate numbers that only
// work as a pair, and every one of these relationships is invisible until you
// are standing in the corridor wearing the headset — which is the worst
// possible place to discover one of them has drifted.

describe('the corridor hides its own construction', () => {
    it('reaches further behind the viewer than the fog can see', () => {
        // The tube is open at both ends. If the fog stops dissolving things
        // before the rear opening, turning around shows the corridor's cut edge
        // as a hard rim floating in space — and with pure look-around from a
        // fixed standpoint, behind you is somewhere people genuinely look.
        expect(BACKDROPS.tunnel.fogFar).toBeLessThan(TUNNEL_BEHIND)
    })

    it('runs further ahead than the mouth ever waits', () => {
        // The mouth starts as the dark line at the end of the corridor. Park it
        // beyond the tube's own end and it is a disc floating in open fog with
        // nothing capping it.
        expect(Math.abs(MOUTH_FAR)).toBeLessThan(TUNNEL_AHEAD)
        expect(TUNNEL_AHEAD + TUNNEL_BEHIND).toBe(TUNNEL_LENGTH)
    })
})

describe('both ends are luminous, because the piece has no front', () => {
    // 360 look-around from a fixed standpoint means "forward" is wherever the
    // visitor happens to have turned. Lighting one end of the corridor does not
    // remove the black hole, it moves it behind their head — which is worse,
    // because they find it by accident halfway through the sequence.

    it('keeps the throat glow inside the tube AT BOTH ENDS so the walls mask it', () => {
        // This is the whole reason no mask is drawn: past the tube's radius at
        // this depth, the glow sits behind wall geometry that is nearer to the
        // eye, so it clips to exactly the shape of the opening for free. Push it
        // beyond the corridor's end and it becomes an unmasked blob of light
        // hanging in the fog. The two ends are NOT the same distance away —
        // the corridor runs further ahead than behind — so this has to hold
        // against the shorter one.
        expect(THROAT_DEPTH).toBeLessThan(TUNNEL_AHEAD)
        expect(THROAT_DEPTH).toBeLessThan(TUNNEL_BEHIND)
    })

    it('places the glow in the corridor\'s falloff, not in its clean near walls', () => {
        // Inside fogNear the walls are still reading as white surface and a
        // glow there is a lamp in the room. The job is to fill the distance
        // that fog has already dissolved — the black disc at the vanishing
        // point that the artist asked to be rid of.
        expect(THROAT_DEPTH).toBeGreaterThan(BACKDROPS.tunnel.fogNear)
        expect(THROAT_DEPTH).toBeLessThanOrEqual(BACKDROPS.tunnel.fogFar)
    })

    it('starts the mouth beyond the glow so the dark arrives beyond the light', () => {
        // The ending is the dark end of the corridor travelling at the camera
        // and swallowing the frame. It has to come from FURTHER than the throat
        // or the eclipse begins in front of the light it is supposed to be
        // putting out, which reads as a disc sliding across a lamp.
        expect(Math.abs(MOUTH_FAR)).toBeGreaterThan(THROAT_DEPTH)
    })
})
