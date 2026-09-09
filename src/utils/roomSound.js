// The visitor's sound switch, and it starts OFF.
//
// Owner, 2026-09-10: "there are playing sound inside space — make button and by
// def make it muted."
//
// Two faults sat behind that. On `/spaces` every card is a live surface in an
// iframe, and an `audio` entity autoplays at volume 0.8 the moment its room
// resolves — so a grid of rooms is a grid of soundtracks, from a page that
// looks like a list of pictures. (Cascade Club was the one singing.) And in a
// room a visitor actually opened there was no way to turn it off at all: the
// only controls were the browser tab's mute and leaving.
//
// ---- WHY THIS IS A GATE AND NOT JUST A BOOLEAN ------------------------------
//
// Sound arriving unasked is a VISITOR problem. An author placing an audio
// object has to hear it, or the editor is broken in a way no button explains.
// But the visitor's surface and the author's surface render through the SAME
// object components — a published room in orbit mode is StudioViewport, the
// same one the editor draws with — so "which component am I in" cannot answer
// it.
//
// So the page arms the gate. `armVisitorSound()` is called by the public
// viewer while it is mounted; until something arms it, `isSoundAllowed()` is
// true and every renderer behaves exactly as it did before this file existed.
//
// It is deliberately NOT a React context: the things that make noise are
// three.js objects inside a Canvas — sometimes several Canvases on one page —
// and R3F does not forward context across its reconciler without a bridge. A
// module-level switch with a subscribe list reaches all of them.

import { isPreviewRequest } from './previewMode.js'

const STORAGE_KEY = 'dii:sound-on'

const listeners = new Set()
let soundOn = false
let loaded = false
let gates = 0

// A thumbnail is a picture. `?preview=1` is the card grid, the map's source
// view and the projection mapper's sources — surfaces that hold a room with
// nobody standing in it. They are locked silent, and `setSoundOn` there is a
// no-op rather than an error: the caller is a control that should not have
// been rendered on such a page at all.
export const isSoundLocked = () => {
    if (typeof window === 'undefined') return true
    return isPreviewRequest(window.location.search)
}

// Is anything on this page asking for the gate? The public viewer arms it while
// mounted; the editor never does.
export const isSoundGated = () => gates > 0 || isSoundLocked()

export const armVisitorSound = () => {
    gates += 1
    return () => {
        gates = Math.max(0, gates - 1)
    }
}

const readStored = () => {
    if (typeof window === 'undefined') return false
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
        // Private windows and "block site data" throw on ACCESS, not only on
        // write. Silence is the right answer to not knowing.
        return false
    }
}

// The switch's own position — what the button shows, and what gets remembered.
export const isSoundOn = () => {
    if (isSoundLocked()) return false
    if (!loaded) {
        soundOn = readStored()
        loaded = true
    }
    return soundOn
}

// What a thing that makes noise should ask. On an ungated page (the editor,
// Raw) this is always true: nothing here changes how an author hears their own
// room.
export const isSoundAllowed = () => {
    if (!isSoundGated()) return true
    return isSoundOn()
}

export const setSoundOn = (next) => {
    if (isSoundLocked()) return false
    const value = Boolean(next)
    loaded = true
    if (value === soundOn) return value
    soundOn = value
    try {
        window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
        // Remembering is a convenience; the switch still works this session.
    }
    for (const listener of [...listeners]) {
        try {
            listener(value)
        } catch {
            // One bad subscriber must not silence the rest of the room.
        }
    }
    return value
}

export const toggleSound = () => setSoundOn(!isSoundOn())

export const subscribeSound = (listener) => {
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
}

// Does this room hold anything to hear? An `audio` entity always makes noise.
// A `video` only when its author asked for it — every other video in the
// product is deliberately a moving picture, and `media.muted` defaults to true
// for exactly that reason. A hidden entity is not heard: hiding an entity hides
// its whole subtree, sound included.
//
// Used to decide whether a room shows a sound switch at all. A switch on a
// silent room is worse than no switch: it promises a sound that is not there.
export const roomHasSound = (entities = []) => (Array.isArray(entities) ? entities : []).some((entity) => {
    if (entity?.components?.runtime?.visible === false) return false
    if (entity?.type === 'audio') return true
    return entity?.type === 'video' && entity?.components?.media?.muted === false
})

// Tests only: put the module back to how a fresh page loads.
export const __resetSoundForTests = () => {
    listeners.clear()
    soundOn = false
    loaded = false
    gates = 0
}
