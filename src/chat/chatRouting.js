import { stripAppBasePath } from '../utils/spaceRouting.js'

// Two addresses, one room each:
//   /chat           → the studio's own room (the `main` space)
//   /{space}/chat   → that space's room
//
// Its own module for the same reason makeRouting.js and mapRouting.js are:
// RootApp must be able to claim the shape BEFORE the generic
// /{space}/{projectSlug} rule reads "chat" as the name of a project.

export const CHAT_SEGMENT = 'chat'
export const CHAT_HOME_SPACE_ID = 'main'

export const getChatLocationState = (location = null) => {
    const pathname = stripAppBasePath(location?.pathname || '/')
    const segments = pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean)
    if (segments.length === 1 && segments[0] === CHAT_SEGMENT) {
        return { isChat: true, spaceId: CHAT_HOME_SPACE_ID }
    }
    if (segments.length === 2 && segments[1] === CHAT_SEGMENT) {
        return { isChat: true, spaceId: segments[0] }
    }
    return { isChat: false, spaceId: '' }
}

// A private conversation is a QUERY on the room, not a path of its own: it must
// never look like a shareable address. `/chat?with=<account>` opens it for the
// person who is signed in and means nothing to anybody else — the two people
// are the only ones who can decrypt a word of it.
export const getPrivateChatTarget = (location = null) => {
    try {
        const params = new URLSearchParams(location?.search || '')
        const withUser = String(params.get('with') || '').trim()
        return withUser || null
    } catch {
        return null
    }
}

export const buildPrivateChatPath = (spaceId, userId, name = null) => {
    const base = buildChatPath(spaceId)
    const params = new URLSearchParams({ with: String(userId) })
    // Carried so the header can name them before any connection exists. It is a
    // label, never an identity — the account id is what everything is keyed on.
    if (name) params.set('who', String(name))
    return `${base}?${params.toString()}`
}

export const buildChatPath = (spaceId = '') => (
    !spaceId || spaceId === CHAT_HOME_SPACE_ID ? `/${CHAT_SEGMENT}` : `/${spaceId}/${CHAT_SEGMENT}`
)
