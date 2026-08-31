// Which objects in the jam this phone added.
//
// !!! THIS IS A COURTESY AGAINST ACCIDENTS, NOT A SECURITY CONTROL. !!!
//
// MANIFESTO §5: serverXR is the authority. Anyone holding `editor` on the open
// space can already change or remove anything in the document, and that is the
// real access model — this list only decides which controls a phone SHOWS. It
// lives in localStorage, so it is editable by whoever holds the device, gone
// when they clear their browser, and worth nothing the moment someone opens the
// console. It must never be the only thing standing between a stranger and
// somebody else's work; if that ever needs to be true, it is a server change
// (an author recorded on the object, checked in serverXR), not a change here.
//
// What it IS good for: at an event, twenty people are in one scene and the
// controls that edit and remove should be attached to the thing you just made,
// not to everything in sight. That is the whole job.
//
// Same shape as loadJamAllTools/saveJamAllTools in src/studio/utils/jamMode.js —
// try/catch around every access, because private-browsing modes throw on read.

export const JAM_MINE_STORAGE_KEY = 'di.jam.mine'

// A phone at an event is not a long-lived editor: cap the list so a browser
// that never clears storage cannot grow it without bound.
export const JAM_MINE_LIMIT = 200

const readRaw = () => {
    try {
        return window.localStorage.getItem(JAM_MINE_STORAGE_KEY)
    } catch {
        return null
    }
}

const writeRaw = (value) => {
    try {
        window.localStorage.setItem(JAM_MINE_STORAGE_KEY, value)
    } catch {
        // storage unavailable (private mode) — the controls just won't survive
        // a reload, which is the correct failure for a convenience.
    }
}

export const loadMineIds = () => {
    const raw = readRaw()
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((id) => typeof id === 'string' && id).slice(-JAM_MINE_LIMIT)
    } catch {
        return []
    }
}

export const rememberMineId = (objectId, currentIds = loadMineIds()) => {
    if (typeof objectId !== 'string' || !objectId) return currentIds
    if (currentIds.includes(objectId)) return currentIds
    const next = [...currentIds, objectId].slice(-JAM_MINE_LIMIT)
    writeRaw(JSON.stringify(next))
    return next
}

export const forgetMineId = (objectId, currentIds = loadMineIds()) => {
    if (typeof objectId !== 'string' || !objectId) return currentIds
    if (!currentIds.includes(objectId)) return currentIds
    const next = currentIds.filter((id) => id !== objectId)
    writeRaw(JSON.stringify(next))
    return next
}

// The one question the surface asks. Deliberately a plain list membership test
// and nothing cleverer: see the warning at the top of this file.
export const isMine = (objectId, mineIds = []) => (
    Boolean(objectId) && Array.isArray(mineIds) && mineIds.includes(objectId)
)
