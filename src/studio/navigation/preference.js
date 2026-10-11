// The viewer's viewport-navigation preference, kept per device in localStorage
// (a convenience, not shared state). Every storage touch is in try/catch: a
// private window or blocked storage must still give the default.
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_NAVIGATION_PRESET, normalizeNavigationPreset } from './mappings.js'

export const NAVIGATION_STORAGE_KEY = 'di.studio.navigation'
export const ORBIT_SELECTION_STORAGE_KEY = 'di.studio.navigation.orbitSelection'
export const MOVE_STEP_STORAGE_KEY = 'di.studio.navigation.moveStep'
export const NAVIGATION_CHANGE_EVENT = 'di:studio-navigation-change'

function storage() {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
        return null
    }
}

export function getNavigationPreference() {
    try {
        return normalizeNavigationPreset(storage()?.getItem(NAVIGATION_STORAGE_KEY))
    } catch {
        return DEFAULT_NAVIGATION_PRESET
    }
}

// The owner's own move step in metres per 100 px of right-drag (worldMove.js); null = auto from the scene.
export function getMoveStepPreference() {
    try {
        const n = Number.parseFloat(storage()?.getItem(MOVE_STEP_STORAGE_KEY))
        return Number.isFinite(n) && n > 0 ? n : null
    } catch {
        return null
    }
}
export function setMoveStepPreference(value) {
    const n = Number.parseFloat(value)
    const next = Number.isFinite(n) && n > 0 ? n : null
    try {
        if (next == null) storage()?.removeItem(MOVE_STEP_STORAGE_KEY)
        else storage()?.setItem(MOVE_STEP_STORAGE_KEY, String(next))
    } catch {
        // storage blocked — the choice holds for this page only
    }
    memory.moveStep = next
    memory.moveStepSet = true
    announce()
    return next
}
export function getOrbitSelectionPreference() {
    try {
        return storage()?.getItem(ORBIT_SELECTION_STORAGE_KEY) === '1'
    } catch {
        return false
    }
}

function announce() {
    try {
        window.dispatchEvent(new Event(NAVIGATION_CHANGE_EVENT))
    } catch {
        // no window (tests/SSR) — nothing listens
    }
}

// Returns the value actually in effect (junk -> default).
export function setNavigationPreference(value) {
    const next = normalizeNavigationPreset(value)
    try {
        storage()?.setItem(NAVIGATION_STORAGE_KEY, next)
    } catch {
        // storage blocked — the choice holds for this page only
    }
    memory.preset = next
    announce()
    return next
}

export function setOrbitSelectionPreference(on) {
    const next = Boolean(on)
    try {
        storage()?.setItem(ORBIT_SELECTION_STORAGE_KEY, next ? '1' : '0')
    } catch {
        // storage blocked — the choice holds for this page only
    }
    memory.orbitSelection = next
    announce()
    return next
}

// When storage throws, a choice made on this page still has to stick for the
// rest of the visit; this is that page-lifetime copy.
const memory = { preset: null, orbitSelection: null, moveStep: null, moveStepSet: false }

function read() {
    return {
        preset: memory.preset ?? getNavigationPreference(),
        orbitSelection: memory.orbitSelection ?? getOrbitSelectionPreference(),
        moveStep: memory.moveStepSet ? memory.moveStep : getMoveStepPreference(),
    }
}

// Tests only: forget the page-lifetime copy.
export function resetNavigationPreferenceMemory() {
    memory.preset = null
    memory.orbitSelection = null
    memory.moveStep = null
    memory.moveStepSet = false
}

export function useNavigationPreference() {
    const [state, setState] = useState(read)
    useEffect(() => {
        const sync = () => setState(read())
        // Another tab changed it: storage is the truth again.
        const syncFromStorage = () => {
            resetNavigationPreferenceMemory()
            sync()
        }
        window.addEventListener(NAVIGATION_CHANGE_EVENT, sync)
        window.addEventListener('storage', syncFromStorage)
        return () => {
            window.removeEventListener(NAVIGATION_CHANGE_EVENT, sync)
            window.removeEventListener('storage', syncFromStorage)
        }
    }, [])
    const setPreset = useCallback((value) => setNavigationPreference(value), [])
    const setOrbitSelection = useCallback((on) => setOrbitSelectionPreference(on), [])
    const setMoveStep = useCallback((value) => setMoveStepPreference(value), [])
    return { ...state, setPreset, setOrbitSelection, setMoveStep }
}
