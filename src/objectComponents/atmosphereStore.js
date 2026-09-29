// Which haze the room's air holds, per renderer. RenderSettingsEffect writes it
// from `document.renderSettings.atmosphere` (both renderers mount one); every
// SpotLightObject in the same Canvas reads it, so a beam knows whether to draw
// physically (beamAir.js) or as the old flat cone, without a prop threaded through
// both renderers' entity switches. Keyed by the WebGLRenderer: two Canvases on one
// page (the visualiser's room beside another view) never share air.
import { useSyncExternalStore } from 'react'

const stores = new WeakMap()
const storeOf = (gl) => {
    if (!gl) return null
    let store = stores.get(gl)
    if (!store) {
        store = { value: null, listeners: new Set() }
        stores.set(gl, store)
    }
    return store
}

const same = (a, b) => a === b || (a && b && a.scattering === b.scattering && a.anisotropy === b.anisotropy)

/** Set the air for this renderer (null = no atmosphere: the old cones). */
export const setAtmosphere = (gl, atmosphere) => {
    const store = storeOf(gl)
    if (!store || same(store.value, atmosphere)) return
    store.value = atmosphere || null
    for (const listener of store.listeners) listener()
}

export const getAtmosphere = (gl) => storeOf(gl)?.value || null

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
