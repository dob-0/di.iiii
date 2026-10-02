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
import { buildHazeField, hazeFogFar, hazeSettingsOf, sameHazeField } from './hazeField.js'
import { hazeUniformsFor, writeHazeUniforms } from './hazeUniforms.js'

const stores = new WeakMap()
const storeOf = (gl) => {
    if (!gl) return null
    let store = stores.get(gl)
    if (!store) {
        store = { value: null, machines: [], field: null, listeners: new Set(), fieldListeners: new Set() }
        stores.set(gl, store)
    }
    return store
}

const same = (a, b) =>
    a === b ||
    (a && b && a.scattering === b.scattering && a.anisotropy === b.anisotropy && JSON.stringify(a.haze ?? null) === JSON.stringify(b.haze ?? null))

const refreshField = (gl, store) => {
    const field = store.value ? buildHazeField(hazeSettingsOf(store.value), store.machines) : null
    const changed = !sameHazeField(field, store.field)
    if (changed) store.field = field
    writeHazeUniforms(hazeUniformsFor(gl), store.value, store.field)
    if (changed) for (const listener of store.fieldListeners) listener(store.field)
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

/**
 * Real bloom is drawing this renderer's frames (HdrBloom.jsx): the beams' glare veil,
 * which only stood in for it, steps aside. Off again in a headset, where bloom cannot run.
 */
const bloomAllowed = new WeakMap()
/** The frame-rate governor (qualityGovernor.js) lets bloom run, or not, on this renderer. */
export const setBloomAllowed = (gl, allowed) => { if (gl) bloomAllowed.set(gl, Boolean(allowed)) }
export const isBloomAllowed = (gl) => (gl ? bloomAllowed.get(gl) !== false : true)

const beamMeshes = new WeakMap()
/** A beam's core hull, for its reflection in the floor (beamMirror.js). Returns the unregister. */
export const registerBeamMesh = (gl, mesh) => {
    if (!gl || !mesh) return () => {}
    let set = beamMeshes.get(gl)
    if (!set) { set = new Set(); beamMeshes.set(gl, set) }
    set.add(mesh)
    return () => set.delete(mesh)
}
export const beamMeshesOf = (gl) => beamMeshes.get(gl) || new Set()

const glareMeshes = new WeakMap()
/** A beam's glare hull, shown only while the room is drawn without bloom. Returns the unregister. */
export const registerGlareMesh = (gl, mesh) => {
    if (!gl || !mesh) return () => {}
    let set = glareMeshes.get(gl)
    if (!set) { set = new Set(); glareMeshes.set(gl, set) }
    set.add(mesh)
    mesh.visible = hazeUniformsFor(gl).uGlareOn.value > 0.5
    return () => set.delete(mesh)
}

export const setBloomActive = (gl, active) => {
    const u = hazeUniformsFor(gl).uGlareOn
    const value = active ? 0 : 1
    if (u.value === value) return
    u.value = value
    // not drawn at all while bloom runs: 64 wide hulls rasterised only to discard cost fill
    for (const mesh of glareMeshes.get(gl) || []) mesh.visible = value > 0.5
}

/** The field the beams draw now (null: one uniform haze). */
export const getHazeField = (gl) => storeOf(gl)?.field || null

/** Be told when the field changes (a machine turned up, the settings edited). Returns the unsubscribe. */
export const subscribeHazeField = (gl, listener) => {
    const store = storeOf(gl)
    if (!store) return () => {}
    store.fieldListeners.add(listener)
    return () => store.fieldListeners.delete(listener)
}

/**
 * The fog's resting distances: the haze's (0 … 1.6/σ) when the room works its haze out
 * from its machines, else `fallback` (as authored). Whoever moves the fog at run time —
 * SmartView stands it back by the camera's distance outside the building — adds its
 * offset to THIS, so the two compose instead of overwriting each other.
 */
export const hazeFogBase = (gl, fallback = null) => {
    const field = getHazeField(gl)
    if (!field) return fallback
    return { near: 0, far: Math.min(hazeFogFar(field.fill), 1e5) }
}

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
