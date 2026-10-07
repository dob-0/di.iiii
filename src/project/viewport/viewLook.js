// THE LOOK — two ways to see the same room, kept side by side (owner, 2026-10-08: "dark is better, 0.15, dark can go
// light, but I want the current look too — keep this one as a parallel one").
//
//   current  the room exactly as it was drawn before: its lamps, its ambient, no environment light.
//   form     the same room with a dim image-based fill (a neutral studio environment, three.js RoomEnvironment through
//            PMREMGenerator, set as scene.environment) so unlit surfaces — steel, rust, the floor — keep their form.
//            The fill's level is the viewer's to move: 0 (no fill) … FORM_LIGHT_MAX (daylight-like), default 0.03 (the owner chose it by eye on his screen, 2026-10-08).
//
// Why a fill and not more lamps: with only a flat ambient, a surface that no lamp reaches is one flat colour, and a
// metal with little diffuse goes near black (measured 2026-10-08: the trial 2×2, ~/Downloads/moxir-look/
// trial-anisotropy-environment.jpg). Image-based lighting is the standard answer (three.js scene.environment, glTF
// PBR); the level was chosen by the owner by eye on that trial, not derived.
//
// The choice is the viewer's own, remembered per browser; the document is never written.
import { useSyncExternalStore } from 'react'

export const LOOKS = ['current', 'form']
export const FORM_LIGHT_DEFAULT = 0.03
export const FORM_LIGHT_MAX = 0.5
export const LOOK_KEY = 'di.view.look'
export const FORM_LIGHT_KEY = 'di.view.formLight'

export const lookOf = (value) => (LOOKS.includes(value) ? value : 'current')

export const formLightOf = (value) => {
    const n = Number(value)
    if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return FORM_LIGHT_DEFAULT
    return Math.min(FORM_LIGHT_MAX, Math.max(0, n))
}

/** The environment intensity a look asks for: nothing in the current look. */
export const environmentIntensityFor = (look, light) => (lookOf(look) === 'form' ? formLightOf(light) : 0)

const read = (key) => {
    try { return window.localStorage.getItem(key) } catch { return null }
}
const write = (key, value) => {
    try { window.localStorage.setItem(key, String(value)) } catch { /* private window: lives for this page only */ }
}

let state = null
const listeners = new Set()
const current = () => {
    if (!state) state = { look: lookOf(read(LOOK_KEY)), light: formLightOf(read(FORM_LIGHT_KEY)) }
    return state
}
const emit = () => listeners.forEach((fn) => fn())

export const getViewLook = () => current()
export const setViewLook = (look) => {
    const next = lookOf(look)
    if (next === current().look) return
    state = { ...current(), look: next }
    write(LOOK_KEY, next)
    emit()
}
export const setFormLight = (light) => {
    const next = formLightOf(light)
    if (next === current().light) return
    state = { ...current(), light: next }
    write(FORM_LIGHT_KEY, next)
    emit()
}
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

/** React hook: { look, light } and it re-renders when either changes. */
export const useViewLook = () => useSyncExternalStore(subscribe, getViewLook, getViewLook)

/** For tests: forget the cached state so the next read goes to storage again. */
export const resetViewLookForTests = () => { state = null; listeners.clear() }
