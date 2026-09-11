// The list of private conversations this BROWSER knows about.
//
// It is here and not on the server on purpose. A server-side list of who talks
// to whom is the metadata that end-to-end encryption is largely for: the words
// would still be sealed, and di.iiii would still be able to say that these two
// people spoke, at these times, this often. So the index is assembled from what
// is already in this browser — the histories useP2PChat keeps — plus a small
// map of names, which is a label for the list and never an identity.
//
// The cost, stated in the interface as well as here: clearing this browser's
// storage clears the list along with the conversations. Nobody else has a copy.

const HISTORY_PREFIX = 'dii.dm.with.'
const NAMES_KEY = 'dii.dm.names'

const readJson = (key, fallback) => {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

const writeJson = (key, value) => {
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage off: the list is just empty */ }
}

export const rememberConversationName = (userId, label) => {
    if (!userId || !label) return
    const names = readJson(NAMES_KEY, {}) || {}
    if (names[userId] === label) return
    names[userId] = String(label).slice(0, 60)
    writeJson(NAMES_KEY, names)
}

export const forgetConversationName = (userId) => {
    if (!userId) return
    const names = readJson(NAMES_KEY, {}) || {}
    if (!(userId in names)) return
    delete names[userId]
    writeJson(NAMES_KEY, names)
}

export const listRememberedConversations = () => {
    let keys = []
    try {
        keys = Object.keys(window.localStorage).filter((key) => key.startsWith(HISTORY_PREFIX))
    } catch {
        return []
    }
    const names = readJson(NAMES_KEY, {}) || {}
    return keys
        .map((key) => {
            const userId = key.slice(HISTORY_PREFIX.length)
            const history = readJson(key, []) || []
            const last = Array.isArray(history) ? history[history.length - 1] : null
            return {
                userId,
                label: names[userId] || null,
                // A message that never opened has null text — the list says the
                // conversation exists without inventing a preview for it.
                lastText: last?.text || null,
                lastAt: Number(last?.at) || 0
            }
        })
        // A conversation with nothing in it is one that was opened and never
        // used; it is not a row anybody wants to look at.
        .filter((conversation) => conversation.lastAt > 0 || conversation.label)
        .sort((a, b) => b.lastAt - a.lastAt)
}

// What "read" means: this device had the room open. Kept next to the private
// index because it is the same kind of fact — true of a browser, not a person,
// and never sent anywhere.
const SEEN_PREFIX = 'dii.chat.seen.'

export const readRoomSeen = (spaceId) => {
    try { return Number(window.localStorage.getItem(`${SEEN_PREFIX}${spaceId}`) || 0) } catch { return 0 }
}

export const markRoomSeen = (spaceId) => {
    if (!spaceId) return
    try { window.localStorage.setItem(`${SEEN_PREFIX}${spaceId}`, String(Date.now())) } catch { /* nothing kept */ }
}
