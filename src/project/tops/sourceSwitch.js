// The on/off switch of a live source (a camera, a network source, a deck input).
//
// Off means: THIS computer stops using the source. The state belongs to this browser
// profile, never to the project: it is one localStorage value, no op, no server call.
//   di.vjDeck.sourcesOff = { v: 1, off: ['camera:Front', 'input:in1', ...] }
//
// A source key is the stable reference a deck clip already stores for its source:
// a camera clip stores `camera` (the device label), an input clip stores `input`
// (in1..in4); a network source has no clip, its label is the key.
//
// Every page of this browser follows at once: the `storage` event reaches the OTHER
// pages, `subscribeSourcesOff` reaches the page that made the change (the storage
// event never fires there). `getSourcesOff` is the useSyncExternalStore snapshot: the
// same frozen Set until the state really changes.

export const SOURCES_OFF_KEY = 'di.vjDeck.sourcesOff'
export const SOURCES_OFF_VERSION = 1

const EMPTY = Object.freeze(new Set())
const listeners = new Set()
let current = null // null = not read yet
let attached = false

export const cameraSourceKey = (label) => (typeof label === 'string' && label.trim() ? `camera:${label.trim()}` : '')
export const inputSourceKey = (input) => (typeof input === 'string' && input ? `input:${input}` : '')
export const networkSourceKey = (label) => (typeof label === 'string' && label.trim() ? `ndi:${label.trim()}` : '')

const freeze = (keys) => (keys.size ? Object.freeze(new Set(keys)) : EMPTY)

/** The off keys held in a stored text; an unknown version or a broken value means none. */
export const parseSourcesOff = (text) => {
    try {
        const value = JSON.parse(text)
        if (!value || value.v !== SOURCES_OFF_VERSION || !Array.isArray(value.off)) return EMPTY
        return freeze(new Set(value.off.filter((key) => typeof key === 'string' && key)))
    } catch {
        return EMPTY
    }
}

const readStored = () => {
    try {
        const text = globalThis.localStorage?.getItem(SOURCES_OFF_KEY)
        return text ? parseSourcesOff(text) : EMPTY
    } catch {
        return EMPTY
    }
}

const same = (a, b) => a.size === b.size && [...a].every((key) => b.has(key))

const publish = (next) => {
    if (current && same(current, next)) return
    current = next
    for (const listener of [...listeners]) listener()
}

const onStorage = (event) => {
    // A cleared storage (key null) or this key; anything else is not ours.
    if (event && event.key !== null && event.key !== SOURCES_OFF_KEY) return
    publish(readStored())
}

/** The current off keys: a frozen Set, the same object until something changes. */
export const getSourcesOff = () => {
    if (current === null) current = readStored()
    return current
}

export const isSourceOff = (key) => Boolean(key) && getSourcesOff().has(key)

export const subscribeSourcesOff = (listener) => {
    listeners.add(listener)
    if (!attached && typeof globalThis.addEventListener === 'function') {
        globalThis.addEventListener('storage', onStorage)
        attached = true
    }
    return () => {
        listeners.delete(listener)
        if (!listeners.size && attached) {
            globalThis.removeEventListener?.('storage', onStorage)
            attached = false
        }
    }
}

/** Switch one source off or on. The page keeps the state even when the storage refuses it. */
export const setSourceOff = (key, off) => {
    if (!key) return
    const next = new Set(getSourcesOff())
    if (off) next.add(key)
    else next.delete(key)
    try {
        if (next.size) globalThis.localStorage?.setItem(SOURCES_OFF_KEY, JSON.stringify({ v: SOURCES_OFF_VERSION, off: [...next] }))
        else globalThis.localStorage?.removeItem(SOURCES_OFF_KEY)
    } catch { /* this page still follows its own change */ }
    publish(freeze(next))
}

/** For tests: forget the cached state and the storage listener. */
export const resetSourcesOffForTest = () => {
    current = null
    listeners.clear()
    if (attached) globalThis.removeEventListener?.('storage', onStorage)
    attached = false
}
