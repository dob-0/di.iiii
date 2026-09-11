import { stripAppBasePath } from '../utils/spaceRouting.js'

// Four addresses:
//   /chat            → the list. What the installed app opens on.
//   /chat/{space}    → that space's room. The canonical room address.
//   /{space}/chat    → the same room, kept because links to it exist.
//   /chat?with={id}  → one private conversation.
//
// The room used to be at `/chat` itself and the list did not exist: opening the
// app dropped you inside `main` with no way to see anything else, no way to
// start a conversation with somebody who was not standing in that room, and no
// way back out. A chat app opens on a list — that is not decoration, it is the
// difference between one room and a place with rooms in it.
//
// Rooms live UNDER /chat rather than at /{space}/chat for one concrete reason:
// the service worker's scope is `/chat`, and a scope does not cover
// `/main/chat`. Putting the canonical address inside the scope is what keeps
// the installed app working when the network does not.
//
// Its own module for the same reason makeRouting.js and mapRouting.js are:
// RootApp must be able to claim the shape BEFORE the generic
// /{space}/{projectSlug} rule reads "chat" as the name of a project.

export const CHAT_SEGMENT = 'chat'
export const CHAT_HOME_SPACE_ID = 'main'

export const getChatLocationState = (location = null) => {
    const pathname = stripAppBasePath(location?.pathname || '/')
    const segments = pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean)
    // The list. A private conversation is a query ON the list's address, so the
    // caller decides which of the two this is by reading `with` as well.
    if (segments.length === 1 && segments[0] === CHAT_SEGMENT) {
        return { isChat: true, isHome: true, spaceId: '' }
    }
    if (segments.length === 2 && segments[0] === CHAT_SEGMENT) {
        return { isChat: true, isHome: false, spaceId: segments[1] }
    }
    if (segments.length === 2 && segments[1] === CHAT_SEGMENT) {
        return { isChat: true, isHome: false, spaceId: segments[0] }
    }
    return { isChat: false, isHome: false, spaceId: '' }
}

// A private conversation is a QUERY on the list, not a path of its own: it must
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

export const buildChatHomePath = () => `/${CHAT_SEGMENT}`

export const buildChatPath = (spaceId = '') => (
    `/${CHAT_SEGMENT}/${spaceId || CHAT_HOME_SPACE_ID}`
)

export const buildPrivateChatPath = (userId, name = null) => {
    const params = new URLSearchParams({ with: String(userId) })
    // Carried so the header can name them before any connection exists. It is a
    // label, never an identity — the account id is what everything is keyed on.
    if (name) params.set('who', String(name))
    return `${buildChatHomePath()}?${params.toString()}`
}
