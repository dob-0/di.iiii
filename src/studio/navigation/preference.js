// The viewer's viewport-navigation preference, kept per device in localStorage
// (a convenience, not shared state). Every storage touch is in try/catch: a
// private window or blocked storage must still give the default.
import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_NAVIGATION_PRESET, normalizeNavigationPreset } from './mappings.js'
import { DEFAULT_TURN, normalizeSpeedSetting, normalizeTurnSetting } from './freeMove.js'
import { DEFAULT_MOVE_ID, normalizeMoveId } from './moves.js'
import { DEFAULT_EDIT_MOUSE, normalizeEditMouse } from './editMouse.js'

export const NAVIGATION_STORAGE_KEY = 'di.studio.navigation'
export const ORBIT_SELECTION_STORAGE_KEY = 'di.studio.navigation.orbitSelection'
export const NAVIGATION_CHANGE_EVENT = 'di:studio-navigation-change'
// The standard move's settings (freeMove.js): speed ('auto' or metres per wheel notch) and turning ('place', the default, or 'point').
export const SPEED_STORAGE_KEY = 'di.studio.navigation.speed'
export const TURN_STORAGE_KEY = 'di.studio.navigation.turn'
// Which named move (moves.js) this device uses; Move 1 until it chooses. With one move the engine does not read it
// (useCameraNavigation has only Move 1's branch); the day a second move exists, the engine branches on it.
export const MOVE_STORAGE_KEY = 'di.studio.navigation.move'
// The mouse in the Studio's Edit (editMouse.js): 'pull' (Pull to move, the default) or 'blender' (Like Blender, 2026-10-12's map).
export const EDIT_MOUSE_STORAGE_KEY = 'di.studio.navigation.editMouse'

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

export function getSpeedPreference() {
    try {
        return normalizeSpeedSetting(storage()?.getItem(SPEED_STORAGE_KEY))
    } catch {
        return 'auto'
    }
}

export function getTurnPreference() {
    try {
        return normalizeTurnSetting(storage()?.getItem(TURN_STORAGE_KEY))
    } catch {
        return DEFAULT_TURN
    }
}

export function getMovePreference() {
    try {
        return normalizeMoveId(storage()?.getItem(MOVE_STORAGE_KEY))
    } catch {
        return DEFAULT_MOVE_ID
    }
}

// Returns the value actually in effect (junk -> the default move).
export function setMovePreference(value) {
    const next = normalizeMoveId(value)
    try {
        storage()?.setItem(MOVE_STORAGE_KEY, next)
    } catch {
        // storage blocked — the choice holds for this page only
    }
    memory.move = next
    announce()
    return next
}

export function getEditMousePreference() {
    try {
        return normalizeEditMouse(storage()?.getItem(EDIT_MOUSE_STORAGE_KEY))
    } catch {
        return DEFAULT_EDIT_MOUSE
    }
}

// Returns the value actually in effect (junk -> 'pull').
export function setEditMousePreference(value) {
    const next = normalizeEditMouse(value)
    try {
        storage()?.setItem(EDIT_MOUSE_STORAGE_KEY, next)
    } catch {
        // storage blocked — the choice holds for this page only
    }
    memory.editMouse = next
    announce()
    return next
}

// Returns the value actually in effect (junk -> 'auto').
export function setSpeedPreference(value) {
    const next = normalizeSpeedSetting(value)
    try {
        storage()?.setItem(SPEED_STORAGE_KEY, String(next))
    } catch {
        // storage blocked — the choice holds for this page only
    }
    memory.speed = next
    announce()
    return next
}

// Returns the value actually in effect (junk -> DEFAULT_TURN, 'place').
export function setTurnPreference(value) {
    const next = normalizeTurnSetting(value)
    try {
        storage()?.setItem(TURN_STORAGE_KEY, next)
    } catch {
        // storage blocked — the choice holds for this page only
    }
    memory.turn = next
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
const memory = { preset: null, orbitSelection: null, speed: null, turn: null, move: null, editMouse: null }

function read() {
    return {
        preset: memory.preset ?? getNavigationPreference(),
        orbitSelection: memory.orbitSelection ?? getOrbitSelectionPreference(),
        speed: memory.speed ?? getSpeedPreference(),
        turn: memory.turn ?? getTurnPreference(),
        move: memory.move ?? getMovePreference(),
        editMouse: memory.editMouse ?? getEditMousePreference(),
    }
}

// Tests only: forget the page-lifetime copy.
export function resetNavigationPreferenceMemory() {
    memory.preset = null
    memory.orbitSelection = null
    memory.speed = null
    memory.turn = null
    memory.move = null
    memory.editMouse = null
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
    const setSpeed = useCallback((value) => setSpeedPreference(value), [])
    const setTurn = useCallback((value) => setTurnPreference(value), [])
    const setMove = useCallback((value) => setMovePreference(value), [])
    const setEditMouse = useCallback((value) => setEditMousePreference(value), [])
    return { ...state, setPreset, setOrbitSelection, setSpeed, setTurn, setMove, setEditMouse }
}
