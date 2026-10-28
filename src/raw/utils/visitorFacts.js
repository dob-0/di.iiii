// The facts the Visitor node carries, read from a window. Pure enough to test
// against a hand-built window: every browser call is guarded, because the
// pages this runs in include opaque frames where touching storage throws.

// A phone: a coarse pointer on a screen whose short side is under 600 css px.
// A tablet (short side 768+) is not a phone; a touch laptop is not either.
export const PHONE_SHORT_SIDE = 600

const matches = (win, query) => {
    try {
        return Boolean(win?.matchMedia?.(query)?.matches)
    } catch {
        return false
    }
}

const isFramed = (win) => {
    try {
        return win.self !== win.top
    } catch {
        // Reading top across origins throws: that IS a frame.
        return true
    }
}

const readParams = (win) => {
    try {
        return new URLSearchParams(win?.location?.search || '')
    } catch {
        return new URLSearchParams()
    }
}

export const readVisitorFacts = (win = globalThis.window) => {
    const width = Math.round(Number(win?.innerWidth) || 0)
    const height = Math.round(Number(win?.innerHeight) || 0)
    const shortSide = Math.min(width, height)
    const params = readParams(win)
    const tag = String(win?.navigator?.language || '')
    return {
        phone: matches(win, '(pointer: coarse)') && shortSide > 0 && shortSide < PHONE_SHORT_SIDE,
        reducedMotion: matches(win, '(prefers-reduced-motion: reduce)'),
        portrait: height > width,
        width,
        height,
        // The primary subtag only ('hy-AM' → 'hy'): what a page switches on.
        language: tag.split('-')[0].toLowerCase(),
        embedded: params.get('embed') === '1' || params.get('preview') === '1' || isFramed(win),
    }
}

// --- what this browser keeps ------------------------------------------------

export const VISITOR_STORAGE_KEY = 'dii.visitor'

// One memory per page load, shared by every Visitor node, so two nodes agree
// on the Id even where storage refuses and nothing survives the reload.
let sessionMemory = null

export const resetVisitorMemoryForTests = () => {
    sessionMemory = null
}

const storageOf = (win) => {
    try {
        return win?.localStorage || null
    } catch {
        return null
    }
}

const newId = (win) => {
    try {
        if (typeof win?.crypto?.randomUUID === 'function') return win.crypto.randomUUID()
    } catch {
        // fall through to the plain random id
    }
    return `v-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

const clean = (stored) => {
    if (!stored || typeof stored !== 'object') return null
    const id = typeof stored.id === 'string' && stored.id ? stored.id : null
    const hue = Number(stored.hue)
    if (!id || !Number.isFinite(hue) || hue < 0 || hue >= 1) return null
    return { id, hue, name: typeof stored.name === 'string' ? stored.name : '' }
}

const readStored = (win) => {
    const storage = storageOf(win)
    if (!storage) return null
    try {
        return clean(JSON.parse(storage.getItem(VISITOR_STORAGE_KEY) || 'null'))
    } catch {
        return null
    }
}

// Returns whether the browser kept it. False is not an error: the memory
// still holds it for the visit, which is what the platform's storage shim
// gives a page in a frame that may not keep anything.
const writeStored = (win, memory) => {
    const storage = storageOf(win)
    if (!storage) return false
    try {
        storage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(memory))
        return true
    } catch {
        return false
    }
}

export const loadVisitorMemory = (win = globalThis.window, random = Math.random) => {
    if (sessionMemory) return sessionMemory
    const stored = readStored(win)
    if (stored) {
        sessionMemory = stored
        return sessionMemory
    }
    sessionMemory = { id: newId(win), hue: Math.floor(random() * 360) / 360, name: '' }
    writeStored(win, sessionMemory)
    return sessionMemory
}

// A wired New name is kept; an empty one changes nothing (an unwired input
// must not wipe a name the visitor gave last week).
export const rememberVisitorName = (name, win = globalThis.window) => {
    const memory = loadVisitorMemory(win)
    const next = String(name ?? '').trim().slice(0, 80)
    if (!next || next === memory.name) return memory
    sessionMemory = { ...memory, name: next }
    writeStored(win, sessionMemory)
    return sessionMemory
}
