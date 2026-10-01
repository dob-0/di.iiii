// Which haze the room's air holds, per renderer. RenderSettingsEffect writes it
// from `document.renderSettings.atmosphere` (both renderers mount one); every
// SpotLightObject in the same Canvas reads it, so a beam knows whether to draw
// physically (beamAir.js) or as the old flat cone, without a prop threaded through
// both renderers' entity switches. Keyed by the WebGLRenderer: two Canvases on one
// page (the visualiser's room beside another view) never share air.
//
// The haze FIELD (hazeField.js) is put together here from two halves that arrive from
// two places: the settings (atmosphere.haze, from RenderSettingsEffect) and the
// machines (the room's hazers and fog machines, from RigBodies, which has the rig's
// type library). Their sum is written into the renderer's shared haze uniforms
// (hazeUniforms.js); a beam never re-renders for it.
import { useSyncExternalStore } from 'react'
import { buildHazeField, hazeSettingsOf, sameHazeField } from './hazeField.js'
import { hazeUniformsFor, writeHazeUniforms } from './hazeUniforms.js'

const stores = new WeakMap()
const storeOf = (gl) => {
    if (!gl) return null
    let store = stores.get(gl)
    if (!store) {
        store = { value: null, machines: [], field: null, listeners: new Set() }
        stores.set(gl, store)
    }
    return store
}

const same = (a, b) =>
    a === b ||
    (a && b && a.scattering === b.scattering && a.anisotropy === b.anisotropy && JSON.stringify(a.haze ?? null) === JSON.stringify(b.haze ?? null))

const refreshField = (gl, store) => {
    const field = store.value ? buildHazeField(hazeSettingsOf(store.value), store.machines) : null
    if (!sameHazeField(field, store.field)) store.field = field
    writeHazeUniforms(hazeUniformsFor(gl), store.value, store.field)
}

/** Set the air for this renderer (null = no atmosphere: the old cones). */
export const setAtmosphere = (gl, atmosphere) => {
    const store = storeOf(gl)
    if (!store || same(store.value, atmosphere)) return
    store.value = atmosphere || null
    refreshField(gl, store)
    for (const listener of store.listeners) listener()
}

/** The room's hazers and fog machines (hazeField.js hazeMachinesOf), for this renderer. */
export const setHazeMachines = (gl, machines) => {
    const store = storeOf(gl)
    if (!store) return
    store.machines = Array.isArray(machines) ? machines : []
    refreshField(gl, store)
}

export const getAtmosphere = (gl) => storeOf(gl)?.value || null

/** The field the beams draw now (null: one uniform haze). */
export const getHazeField = (gl) => storeOf(gl)?.field || null

export function useAtmosphere(gl) {
    return useSyncExternalStore(
        (listener) => {
            const store = storeOf(gl)
            if (!store) return () => {}
            store.listeners.add(listener)
            return () => store.listeners.delete(listener)
        },
        () => getAtmosphere(gl),
        () => getAtmosphere(gl)
    )
}
