// WHO THE CHILD IS — one key, written in one place.
//
// `dii.raw.displayName` is read by RawEditor.jsx (its `displayName` state, and
// the presence hook it hands that to) and NOTHING in Raw has ever written it.
// Studio has a setter; Raw does not. The consequence measured at the camp: every
// child appeared in chat as `Guest-C1B3`, and the same string was stamped as
// `createdBy` on every object they made — so the room a child spent an afternoon
// on was signed by a hex code.
//
// Writing this one key fixes both at once, because both read it. That is the
// whole reason the key is Raw's and not a new `dii.make.*` one: a second key
// would give a child two names and fix neither surface.
//
// The user-id key is Raw's for the same reason — a phone that was in the toybox
// an hour ago has to be the same person now, and the same person if a mentor
// opens the project in Raw beside them.
export const DISPLAY_NAME_KEY = 'dii.raw.displayName'
export const USER_ID_KEY = 'dii.raw.userId'

const MAX_NAME_LENGTH = 24

// A name a child types on a phone keyboard. Trimmed, collapsed, and capped —
// capped because it is drawn in a chat bubble and over an object in the room,
// and 400 characters of held-down key would push both off the screen.
export const normalizeDisplayName = (value = '') =>
    String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)

export const readDisplayName = () => {
    try {
        return normalizeDisplayName(window.localStorage.getItem(DISPLAY_NAME_KEY) || '')
    } catch {
        return ''
    }
}

export const writeDisplayName = (value = '') => {
    const name = normalizeDisplayName(value)
    if (!name) return ''
    try {
        window.localStorage.setItem(DISPLAY_NAME_KEY, name)
    } catch {
        // A locked-down browser is not a reason to refuse the name — the
        // session keeps it in React state either way, it just will not
        // survive a reload.
    }
    return name
}
