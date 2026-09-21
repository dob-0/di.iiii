// SHADOWS FROM THE ROOM — whether the lamps in this space throw shadows of the
// things standing in it, and how finely.
//
// `renderSettings.shadows` was already here and already obeyed by both
// surfaces, but it is the renderer-level switch (`gl.shadowMap.enabled`) and it
// has defaulted to TRUE since the schema was written. Nothing ever cast into
// that shadow map: no light had `castShadow`, and only a loaded model marked
// its meshes. So the map was on and the stage was flat.
//
// The new switch is therefore a different field, `renderSettings.shadowCasting
// = { enabled, mapSize }`, and it defaults to OFF. It could not be folded into
// `shadows` without either changing that field's type under every document
// already saved or turning shadows on everywhere at once — a shadow pass on a
// scanned venue mesh is not free, and no published room asked for it.
//
// Both switches have to be on: shadow maps allowed AND the room casting into
// them. Turning `shadows` off is still the way to spend nothing on shadows at
// all.

export const SHADOW_MAP_SIZES = Object.freeze([1024, 2048])
export const defaultShadowCasting = Object.freeze({ enabled: false, mapSize: 1024 })

/**
 * What the room's render settings say about shadows.
 *
 * @param {object} [renderSettings] `document.renderSettings`
 * @returns {{ enabled: boolean, mapSize: number }}
 */
export const resolveShadowCasting = (renderSettings) => {
    const source = renderSettings && typeof renderSettings === 'object' ? renderSettings : {}
    const casting = source.shadowCasting && typeof source.shadowCasting === 'object' ? source.shadowCasting : {}
    const mapSizeWanted = Number(casting.mapSize)
    return {
        enabled: source.shadows !== false && casting.enabled === true,
        mapSize: SHADOW_MAP_SIZES.includes(mapSizeWanted) ? mapSizeWanted : defaultShadowCasting.mapSize
    }
}

/**
 * Should this object join the shadow pass?
 *
 * Applied by walking the scene rather than by threading a prop through fifteen
 * object components and two entity switches — and the walk is the only way a
 * model's meshes, which arrive from a file long after React has rendered the
 * entity, can be caught at all.
 *
 * Says no to anything that is not a solid mesh, to the reference grid and the
 * gizmo (furniture, not scenery — a grid that cast a shadow would put a black
 * square under the whole room), and to the beam cone, which is light in the air
 * and would otherwise cast a hard dark cone of itself across the floor.
 *
 * @returns {'skip-subtree' | 'skip' | 'wear'}
 */
export const shadowRoleOf = (object) => {
    if (!object) return 'skip'
    if (object.userData?.noShadow === true) return 'skip-subtree'
    if (object.isTransformControls || /^TransformControls/.test(object.type || '')) return 'skip-subtree'
    if (object.isHelper === true) return 'skip-subtree'
    if (!object.isMesh) return 'skip'
    const material = Array.isArray(object.material) ? object.material[0] : object.material
    // A translucent additive thing is light, not matter.
    if (material && material.depthWrite === false) return 'skip'
    return 'wear'
}

/**
 * Turn the scene's solid meshes into shadow casters and catchers.
 *
 * Only ever switches flags ON. With the room's shadows off this is never
 * called, and nothing in an existing room is touched — no lamp casts, so there
 * is nothing to catch either way.
 *
 * @returns {number} how many meshes now wear shadows (for tests)
 */
export const dressForShadows = (root) => {
    let dressed = 0
    const walk = (object) => {
        const role = shadowRoleOf(object)
        if (role === 'skip-subtree') return
        if (role === 'wear') {
            object.castShadow = true
            object.receiveShadow = true
            dressed += 1
        }
        const children = object?.children
        if (Array.isArray(children)) children.forEach(walk)
    }
    walk(root)
    return dressed
}
