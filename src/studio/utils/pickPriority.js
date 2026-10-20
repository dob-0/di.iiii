import { laserUnitKey, isLaserEntity } from './laserTest.js'

// Which entity a click picks, from the ray's hits in distance order (r3f gives every hit as e.intersections).
//
// Owner, 2026-10-13: "I can't move the beams" and "when you finish with a model you can't deselect". Both came from
// picking: a beam took no click at all (its mesh refused the ray), so a click on a beam fell through to the hall or
// an outside box, which was then selected — and nothing under the pointer ever counted as empty, so a click never
// deselected. Rule now (Blender's click-select, read for a room full of light):
//   1. a lamp's BODY (an entity with a light or a fixture) wins over any beam in front of it — beams are see-through;
//   2. a BEAM wins over whatever is behind it (the place, a deck): click the beam, get its lamp;
//   3. UNIT (laser test, owner 2026-10-13 20:5x "I will move the fixtures by hand"): a laser unit is several beam entities
//      (rig-laser-41a, 41b …), so a plain click moves one line. Alt+click on any line of a unit selects all its lines
//      (the group carries userData.svUnit, laserTest.js laserUnitKey; the Studio passes onSelectUnit), and the multi-selection
//      gizmo then moves the whole unit. Shift+G does the same from the keyboard (StudioEditor, "select grouped").
//   4. a LOCKED entity (runtime.locked) is picked like any other — the lock stops moves, not looking (the owner inspects
//      the hall by clicking it); a click on the one selected object again deselects it (the Studio's click handler).
// The flags come from the scene graph: the entity's group carries userData { svEntityId, svPick, svLocked } and a
// beam mesh carries userData.beamPick (SpotLightObject.jsx), so nothing here reads the document.
import { isSteelEntity } from '../../objectComponents/steelOccluder.js'
import { isArchitectureEntity } from '../../project/viewport/smartView/smartViewGeometry.js'

/** The picked entity's id, or null for a click on empty. `infoOf(object)` → { id, body, locked } or null. */
export const pickFromHits = (hits = [], infoOf = entityInfoOf) => {
    let beam = null
    for (const hit of hits) {
        const object = hit?.object
        if (!object) continue
        const info = infoOf(object, hit)
        if (!info) continue
        if (object.userData?.beamPick) {
            if (beam === null) beam = info.id
            continue
        }
        if (info.body) return info.id
        return beam ?? info.id
    }
    return beam
}

/**
 * Walks up from a hit object to the entity group that owns it. A lamp body drawn by RigBodies is one instance of a kind's
 * InstancedMesh with no entity group above it: its lamp is `userData.lampIds[hit.instanceId]` (FixtureBodies.jsx). Without it a
 * moving head's body never took the click and a beam crossing in front won it (owner 2026-10-14: "the moving heads unselectable,
 * or when I select it shows in another place" — the click selected a wash 22 m away whose beam crossed the DJ).
 */
export const entityInfoOf = (object, hit = null) => {
    const lampIds = object?.userData?.lampIds
    if (lampIds && hit?.instanceId != null && lampIds[hit.instanceId] != null) return { id: lampIds[hit.instanceId], body: true, locked: false }
    let o = object
    while (o) {
        const u = o.userData || {}
        if (u.svEntityId) return { id: u.svEntityId, body: u.svPick === 'body', locked: u.svLocked === true, ...(u.svUnit ? { unit: u.svUnit } : {}) }
        o = o.parent
    }
    return null
}

/** The flags every entity's group carries for pickFromHits — a lone object's group and a group entity alike. */
export const pickUserData = (entity) => ({
    svEntityId: entity.id,
    svPick: entity.components?.light || entity.components?.fixture ? 'body' : 'other',
    svLocked: entity.components?.runtime?.locked === true,
    // the building: where a beam stops (objectComponents/beamReach.js)
    svBuilding: isArchitectureEntity(entity),
    // solid steel (truss, crane bridge, girder) stops a beam too, without being the building (steelOccluder.js)
    ...(isSteelEntity(entity) ? { svSteel: true } : {}),
    ...(isLaserEntity(entity) ? { svUnit: laserUnitKey(entity) } : {})
})

/** The unit key of the picked entity, read from the hits (null if it is no laser line). */
export const unitOfHits = (hits = [], pickedId, infoOf = entityInfoOf) => {
    for (const hit of hits) {
        const info = hit?.object ? infoOf(hit.object, hit) : null
        if (info?.id === pickedId && info.unit) return info.unit
    }
    return null
}

// One click handler for every entity's group (walked 2026-10-13: only GROUP entities used the rule, so a top-level
// lamp's beam still took a click meant for the lamp behind it, and an orbit drag that ended on a lamp selected it).
// A plain click on the one selected object again deselects it (owner 10-13: "you can't deselect"); Esc and Alt+A too. r3f calls it on the nearest hit's entity first; it decides from every
// hit under the pointer and stops there, so no entity behind decides again.
export const handlePickClick = (e, { onSelect, onToggleSelect, onSelectUnit = null, selectedIds = null }) => {
    if (e.delta > 2) return
    e.stopPropagation()
    const picked = pickFromHits(e.intersections)
    const additive = e.nativeEvent?.ctrlKey || e.nativeEvent?.metaKey || e.nativeEvent?.shiftKey
    if (picked === null) {
        if (!additive) onSelect?.(null)
        return
    }
    const unit = onSelectUnit && e.nativeEvent?.altKey ? unitOfHits(e.intersections, picked) : null
    if (unit) onSelectUnit(unit, { additive: Boolean(additive) })
    else if (additive) onToggleSelect?.(picked)
    else if (selectedIds?.size === 1 && selectedIds.has(picked)) onSelect?.(null)
    else onSelect?.(picked)
}
