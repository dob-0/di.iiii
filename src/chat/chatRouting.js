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

export const buildChatPath = (spaceId = '') => (
    !spaceId || spaceId === CHAT_HOME_SPACE_ID ? `/${CHAT_SEGMENT}` : `/${spaceId}/${CHAT_SEGMENT}`
)
