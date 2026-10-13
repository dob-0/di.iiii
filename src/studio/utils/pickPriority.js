// Which entity a click picks, from the ray's hits in distance order (r3f gives every hit as e.intersections).
//
// Owner, 2026-10-13: "I can't move the beams" and "when you finish with a model you can't deselect". Both came from
// picking: a beam took no click at all (its mesh refused the ray), so a click on a beam fell through to the hall or
// an outside box, which was then selected — and nothing under the pointer ever counted as empty, so a click never
// deselected. Rule now (Blender's click-select, read for a room full of light):
//   1. a lamp's BODY (an entity with a light or a fixture) wins over any beam in front of it — beams are see-through;
//   2. a BEAM wins over whatever is behind it (the place, a deck): click the beam, get its lamp;
//   3. a LOCKED entity (runtime.locked — the place, the outside boxes) is never picked; if only locked things are
//      under the pointer the click is a click on empty → the selection clears.
// The flags come from the scene graph: the entity's group carries userData { svEntityId, svPick, svLocked } and a
// beam mesh carries userData.beamPick (SpotLightObject.jsx), so nothing here reads the document.

/** The picked entity's id, or null for a click on empty. `infoOf(object)` → { id, body, locked } or null. */
export const pickFromHits = (hits = [], infoOf = entityInfoOf) => {
    let beam = null
    for (const hit of hits) {
        const object = hit?.object
        if (!object) continue
        const info = infoOf(object)
        if (!info) continue
        if (object.userData?.beamPick) {
            if (beam === null && !info.locked) beam = info.id
            continue
        }
        if (info.locked) continue
        if (info.body) return info.id
        return beam ?? info.id
    }
    return beam
}

/** Walks up from a hit object to the entity group that owns it. */
export const entityInfoOf = (object) => {
    let o = object
    while (o) {
        const u = o.userData || {}
        if (u.svEntityId) return { id: u.svEntityId, body: u.svPick === 'body', locked: u.svLocked === true }
        o = o.parent
    }
    return null
}
