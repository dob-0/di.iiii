import { describe, expect, it } from 'vitest'
import {
    PORTAL_ENTER_RADIUS,
    PORTAL_REARM_FACTOR,
    createPortalWalkThrough,
    isTravellablePortal,
    portalEnterRadius
} from './portalWalkThrough.js'

// The walker's per-frame proximity check, driven by hand. Walker itself is a
// full R3F component that needs a WebGL context it will never get in jsdom
// (the reason livePlayerRef.test.js next door reads the source instead), but
// the part that can be got wrong lives here and is plain arithmetic plus a
// latch — so it is walked step by step, the way a visitor would.

const portal = (id, x, z, reference = {}, extra = {}) => ({
    id,
    name: id,
    type: 'portal',
    components: {
        transform: { position: [x, 0, z], rotation: [0, 0, 0], scale: [1, 1, 1], ...(extra.transform || {}) },
        reference: { mode: 'portal', spaceId: 'dilijan', projectId: 'room-3', label: id, ...reference },
        ...(extra.components || {})
    }
})

// A visitor never teleports onto a ring: they arrive from somewhere. Every
// approach below starts from open floor so the latch is armed the way a real
// walk arms it.
const walkIn = (machine, entities, path) => {
    const fired = []
    for (const [x, z] of path) {
        const reached = machine.step(entities, x, z)
        if (reached) fired.push(reached.id)
    }
    return fired
}

const FAR = [40, 40]

describe('the enter radius', () => {
    it('is tight enough that the visitor has to reach the ring itself', () => {
        // The gateway torus is major radius 1.1 + tube 0.12 = 1.22 outer edge.
        expect(PORTAL_ENTER_RADIUS).toBeGreaterThan(1.22)
        expect(PORTAL_ENTER_RADIUS).toBeLessThan(2)
    })

    it('is nothing to do with the 30-metre atmosphere tint', () => {
        // Walker's nearest-zone pass uses a squared threshold of 900. Reusing
        // it here would move the visitor out of the room from half a plaza away.
        expect(PORTAL_ENTER_RADIUS ** 2).toBeLessThan(900)
    })

    it('leaves a real gap before the latch re-arms', () => {
        // Anything less than about a metre of hysteresis and a visitor pausing
        // on the threshold pumps the router.
        expect(PORTAL_ENTER_RADIUS * PORTAL_REARM_FACTOR).toBeGreaterThan(PORTAL_ENTER_RADIUS + 1)
    })

    it('grows with the portal transform, because the drawn ring does too', () => {
        expect(portalEnterRadius(portal('a', 0, 0))).toBe(PORTAL_ENTER_RADIUS)
        const big = portal('b', 0, 0, {}, { transform: { position: [0, 0, 0], scale: [3, 3, 3] } })
        expect(portalEnterRadius(big)).toBe(PORTAL_ENTER_RADIUS * 3)
        // The ring lies flat in XZ, so a non-uniform scale is read on those axes.
        const flat = portal('c', 0, 0, {}, { transform: { position: [0, 0, 0], scale: [1, 9, 2] } })
        expect(portalEnterRadius(flat)).toBe(PORTAL_ENTER_RADIUS * 2)
    })

    it('falls back to the base radius when a portal has no scale at all', () => {
        expect(portalEnterRadius({ components: { transform: { position: [0, 0, 0] } } })).toBe(PORTAL_ENTER_RADIUS)
        expect(portalEnterRadius(null)).toBe(PORTAL_ENTER_RADIUS)
    })
})

describe('which portals are doors', () => {
    it('takes a gateway with a destination', () => {
        expect(isTravellablePortal(portal('a', 0, 0))).toBe(true)
    })

    it('refuses one with no space named — portalHref returns null for it anyway', () => {
        expect(isTravellablePortal(portal('a', 0, 0, { spaceId: '' }))).toBe(false)
        expect(isTravellablePortal(portal('a', 0, 0, { spaceId: '   ' }))).toBe(false)
    })

    // WCC's exhibition floor is ten `mode: 'embed'` portals, every one of them
    // carrying a real spaceId and projectId (verified against the prod space
    // snapshot). They draw no ring — they inline another project's scene where
    // they stand — so treating them as doors would fling a visitor out of the
    // gallery the moment they walked up to a sculpture.
    it('refuses an embed, which is a window and not a door', () => {
        expect(isTravellablePortal(portal('a', 0, 0, { mode: 'embed' }))).toBe(false)
    })

    it('refuses a hidden portal, which the live scene does not render either', () => {
        const hidden = portal('a', 0, 0, {}, { components: { runtime: { visible: false } } })
        expect(isTravellablePortal(hidden)).toBe(false)
    })

    it('refuses anything that is not a portal', () => {
        expect(isTravellablePortal({ type: 'box', components: { transform: { position: [0, 0, 0] } } })).toBe(false)
    })
})

describe('walking through', () => {
    it('fires once when the visitor reaches the ring', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('door', 0, 0)]
        expect(walkIn(machine, doors, [FAR, [0, 6], [0, 3], [0, 1], [0, 0]])).toEqual(['door'])
    })

    it('does not fire while the visitor is still approaching', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('door', 0, 0)]
        expect(walkIn(machine, doors, [FAR, [0, 6], [0, 3], [0, 1.4]])).toEqual([])
    })

    it('does not fire again while they stand in it', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('door', 0, 0)]
        const path = [FAR, [0, 2], [0, 0], [0, 0], [0.1, 0.1], [0, 0], [0, -0.2]]
        expect(walkIn(machine, doors, path)).toEqual(['door'])
    })

    // Hysteresis. Stepping half out of the ring and back in is one arrival, not
    // two — otherwise a visitor loitering on a threshold pumps the router.
    it('does not re-arm on a step backwards inside the hysteresis ring', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('door', 0, 0)]
        // Two metres: clearly off the ring, clearly still in the doorway.
        expect(walkIn(machine, doors, [FAR, [0, 0], [0, 2], [0, 0]])).toEqual(['door'])
    })

    it('fires again once they have actually left and come back', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('door', 0, 0)]
        const clear = PORTAL_ENTER_RADIUS * PORTAL_REARM_FACTOR + 0.5
        expect(walkIn(machine, doors, [FAR, [0, 0], [0, clear], [0, 0]])).toEqual(['door', 'door'])
    })

    it('never fires for a portal with no destination, however long they stand in it', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('nowhere', 0, 0, { spaceId: '' })]
        expect(walkIn(machine, doors, [FAR, [0, 1], [0, 0], [0, 0], [0, 0]])).toEqual([])
    })

    it('takes the nearer of two overlapping doors', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('far', 1.2, 0), portal('near', 0.2, 0)]
        expect(walkIn(machine, doors, [FAR, [0, 0]])).toEqual(['near'])
    })

    it('lets a neighbouring door fire on the way past, once its own ring is reached', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('first', 0, 0), portal('second', 4, 0)]
        expect(walkIn(machine, doors, [FAR, [0, 0], [2, 0], [4, 0]])).toEqual(['first', 'second'])
    })

    it('survives an empty room', () => {
        const machine = createPortalWalkThrough()
        expect(machine.step([], 0, 0)).toBeNull()
        expect(machine.step(undefined, 0, 0)).toBeNull()
    })
})

// The loop this exists to prevent: room A's door lands the visitor in room B,
// where the way back is another door. If B spawns them on or beside it, the
// arrival itself reads as a crossing and the two rooms bounce them forever
// with no frame in which they were ever outside a ring.
describe('the visitor who arrives standing in the way back', () => {
    it('does not travel until they have been seen clear of every door', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('back', 0, 0)]
        // Spawned dead centre and looking around: nothing happens.
        expect(walkIn(machine, doors, [[0, 0], [0.2, 0], [0, 0.3], [0, 0]])).toEqual([])
    })

    it('still works normally once they walk out of it', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('back', 0, 0)]
        const clear = PORTAL_ENTER_RADIUS * PORTAL_REARM_FACTOR + 0.5
        expect(walkIn(machine, doors, [[0, 0], [0, clear], [0, 0]])).toEqual(['back'])
    })

    it('does not count a spawn just outside the ring as clear of it either', () => {
        const machine = createPortalWalkThrough()
        const doors = [portal('back', 0, 0)]
        const inHysteresis = PORTAL_ENTER_RADIUS + 0.2
        expect(walkIn(machine, doors, [[0, inHysteresis], [0, 0]])).toEqual([])
    })
})
