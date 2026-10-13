// Lock and box select for Studio (owner 2026-10-12: "I want to lock the hall so it is not
// selected; in edit mode we need a select mode where you can select many fixtures at once
// like in Blender"). Pure parts only; the viewport and panels call these.
//
// Lock = components.runtime.locked === true (the field the outliner's toggle already wrote).
// A locked object is not picked by a click, a box, or Select all, and no transform moves it.
// Box select = Blender's Select Box tool: what is inside is the projected ORIGIN of each object
// (Blender's object-mode box select tests the origin too), Shift adds, Ctrl removes.
import { isArchitectureEntity } from '../../project/viewport/smartView/smartViewGeometry.js'

export const isLockedEntity = (entity) => entity?.components?.runtime?.locked === true
export const isHiddenEntity = (entity) => entity?.components?.runtime?.visible === false

/** Entities a click or a box may pick: shown and not locked. */
export const isPickableEntity = (entity) => Boolean(entity) && !isLockedEntity(entity) && !isHiddenEntity(entity)

/** What G/R/S may move out of a selection: shown and not locked. A hidden object stays selected after
 *  the Objects window hides it (walked 2026-10-13: G then moved it unseen); a locked one never moves. */
export const movableEntities = (entities = []) => (entities || []).filter(isPickableEntity)

// The rig build's outside and shell boxes (scripts/rigbuild: rig-out-ground, rig-out-road-*,
// rig-shell-*) are the building's surroundings, not rig.
const HALL_ID = /^rig-(out|shell)-/

/** The hall: every entity the smart view calls architecture, plus the rig build's outside/shell boxes. */
export const hallEntityIds = (entities = []) => (entities || [])
    .filter((entity) => isArchitectureEntity(entity) || HALL_ID.test(String(entity?.id || '')))
    .map((entity) => entity.id)

/** One updateComponent op per entity whose lock differs from `locked` — one batch, one undo step. */
export const lockOps = (entities = [], ids = [], locked = true) => {
    const wanted = new Set(ids || [])
    return (entities || [])
        .filter((entity) => wanted.has(entity.id) && isLockedEntity(entity) !== Boolean(locked))
        .map((entity) => ({
            type: 'updateComponent',
            payload: { entityId: entity.id, component: 'runtime', patch: { locked: Boolean(locked) } }
        }))
}

/** The rectangle between two screen points, whichever way it was dragged. */
export const normalizeRect = (a, b) => ({
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y)
})

/** Ids of the points inside the rectangle; a point behind the camera is never inside. */
export const pickInRect = (points = [], rect) => (points || [])
    .filter((p) => p && p.inFront !== false
        && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom)
    .map((p) => p.id)

/** Blender's box modes: 'set' replaces, 'add' (Shift) extends, 'remove' (Ctrl) subtracts. */
export const mergeSelection = (current = [], hits = [], mode = 'set') => {
    if (mode === 'add') return [...new Set([...(current || []), ...hits])]
    if (mode === 'remove') {
        const out = new Set(hits)
        return (current || []).filter((id) => !out.has(id))
    }
    return [...new Set(hits)]
}

export const boxModeFor = (event) => (event?.ctrlKey || event?.metaKey) ? 'remove' : event?.shiftKey ? 'add' : 'set'

/** What a click on a lamp's body does (the rig's bodies are not entities' meshes): a locked or
 *  unknown lamp is ignored so the click passes on; Shift/Ctrl/Meta toggles, else it selects. */
export const pickLampBody = (entities, id, event, { onSelect, onToggle } = {}) => {
    const entity = (entities || []).find((e) => e.id === id)
    if (!entity || entity.components?.runtime?.locked === true) return false
    const n = event?.nativeEvent || event || {}
    if (n.ctrlKey || n.metaKey || n.shiftKey) onToggle?.(id)
    else onSelect?.(id)
    return true
}
