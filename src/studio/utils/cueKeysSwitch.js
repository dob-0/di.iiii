import { useSyncExternalStore } from 'react'

// THE NUMBER KEYS' ONE SWITCH. In Studio a bare 1-9 fires the cue bound to that digit (useStudioCues), and firing a cue changes the real
// lights, and a laser or wall look where the cue carries one. That is on by design, so this switch defaults to ON and only
// lets a person turn it off. Kept on this device in localStorage; every storage call is guarded: a failed read means ON (today's
// behaviour), a failed write keeps the value in memory for this page.
export const CUE_KEYS_STORAGE_KEY = 'di-studio-cue-keys'

let current = null // null = not read yet
const listeners = new Set()

const readStored = () => {
    try {
        return window.localStorage.getItem(CUE_KEYS_STORAGE_KEY) !== '0'
    } catch {
        return true
    }
}

export function getCueKeysOn() {
    if (current === null) current = readStored()
    return current
}

export function setCueKeysOn(on) {
    current = on !== false
    try {
        window.localStorage.setItem(CUE_KEYS_STORAGE_KEY, current ? '1' : '0')
    } catch {
        // kept in memory only
    }
    listeners.forEach((l) => l())
}

export function subscribeCueKeys(listener) {
    listeners.add(listener)
    // Another tab of this browser changed it: read again.
    const onStorage = (e) => {
        if (e && e.key && e.key !== CUE_KEYS_STORAGE_KEY) return
        current = readStored()
        listener()
    }
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
    return () => {
        listeners.delete(listener)
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
    }
}

// Tests only: forget the in-memory value so the next read goes to storage again.
export function resetCueKeysForTest() {
    current = null
}

export const useCueKeysOn = () => useSyncExternalStore(subscribeCueKeys, getCueKeysOn, () => true)
