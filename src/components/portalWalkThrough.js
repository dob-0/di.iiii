// Walking into a portal travels through it.
//
// The ring has always been click-to-enter, which is the right verb in orbit
// mode and the wrong one in walk: the hands are on WASD or the joystick and
// the mouse is looking, so entering a door means stopping, aiming a cursor at
// it and clicking. In a headset there is no cursor to aim at all. Proximity is
// the verb that fits — you go through a door by going through it.
//
// This lives outside LiveProjectScene.jsx because the hard part is not the
// distance, it is the LATCH. A per-frame "am I inside the ring" fires sixty
// times a second while a visitor stands in one; a plain boolean that never
// resets means they can never come back the other way. Both of those are
// invisible in a screenshot and trivial to assert on here.

// Metres, in the portal's own scale. The gateway ring is a torus of major
// radius 1.1 and tube 0.12 (PortalObject.jsx), so its outer edge sits at 1.22:
// this fires as the visitor's feet reach the ring, not before. A 'frame' portal
// is drawn to the same half-width and bar (PORTAL_FRAME), on purpose — its
// jambs stand where the ring's outer edge lies, so one radius fits both door
// shapes and neither needs a special case here. Deliberately
// unrelated to the 30-metre atmosphere-tint radius in Walker's nearest-zone
// pass — that one is generous on purpose, because tinting the sky early is
// welcoming and leaving the room early is not.
export const PORTAL_ENTER_RADIUS = 1.3

// Hysteresis. The latch only re-arms once the visitor is this many enter-radii
// out, so standing in the ring cannot re-fire and a step backwards cannot
// either — they have to actually leave the doorway before it is a doorway again.
export const PORTAL_REARM_FACTOR = 2

// A portal drawn at scale 3 is a three-times-bigger door and has to be
// enterable from proportionally further out, or the ring the visitor can see
// themselves standing inside does nothing. The ring lies flat in XZ, so those
// are the axes that matter.
export const portalEnterRadius = (entity) => {
    const scale = entity?.components?.transform?.scale
    if (!Array.isArray(scale)) return PORTAL_ENTER_RADIUS
    const spread = Math.max(Math.abs(scale[0] ?? 1), Math.abs(scale[2] ?? 1))
    return PORTAL_ENTER_RADIUS * (spread > 0 ? spread : 1)
}

// Only a portal that is a DOOR: `mode: 'embed'` portals are how a composed
// exhibition inlines another project's scene (see PortalObject), they draw no
// ring and lead nowhere, and a hub is full of them. A gateway with no spaceId
// leads nowhere either — portalHref returns null for it, so the click does
// nothing today and walking through it must do nothing too. Hidden entities
// are not rendered by the live scene at all.
export const isTravellablePortal = (entity) => (
    entity?.type === 'portal'
    && entity.components?.reference?.mode !== 'embed'
    && String(entity.components?.reference?.spaceId || '').trim() !== ''
    && entity.components?.runtime?.visible !== false
    && Array.isArray(entity.components?.transform?.position)
)

export function createPortalWalkThrough() {
    let latchedId = null
    // Nobody travels until they have been seen standing clear of every door.
    //
    // A room whose way back is a portal can spawn the visitor near it, and
    // without this the arrival itself reads as a crossing: two rooms bouncing
    // someone between them, in no frame of which they were ever outside a ring.
    let armed = false

    return {
        // Call once per frame with the walker's world XZ. Returns the portal
        // entity to travel through, or null.
        step(entities, x, z) {
            let entering = null
            let enteringDist = Infinity
            let insideAnyRearm = false
            let latchStillNear = false

            for (const entity of entities || []) {
                if (!isTravellablePortal(entity)) continue
                const pos = entity.components.transform.position
                // Squared, like the nearest-zone pass next door — no square
                // roots on a per-frame loop over every entity in the room.
                const dist = (pos[0] - x) ** 2 + (pos[2] - z) ** 2
                const enter = portalEnterRadius(entity)
                const rearm = enter * PORTAL_REARM_FACTOR
                if (dist < rearm * rearm) {
                    insideAnyRearm = true
                    if (entity.id === latchedId) latchStillNear = true
                }
                if (dist < enter * enter && dist < enteringDist) {
                    enteringDist = dist
                    entering = entity
                }
            }

            if (!insideAnyRearm) {
                armed = true
                latchedId = null
            } else if (latchedId !== null && !latchStillNear) {
                // Out of the latched door's orbit but inside another's: that
                // one is free to fire, this one is finished.
                latchedId = null
            }

            if (!entering || !armed) return null
            if (entering.id === latchedId) return null
            latchedId = entering.id
            return entering
        }
    }
}
