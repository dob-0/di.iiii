import { describe, expect, it } from 'vitest'
import { buildChatHomePath, buildChatPath, buildPrivateChatPath, getChatLocationState, getPrivateChatTarget } from './chatRouting.js'
import { isReservedAppSegment } from '../utils/spaceRouting.js'
import { RESERVED_PROJECT_SLUGS, RESERVED_SPACE_SLUGS } from '../../shared/reservedSegments.cjs'

describe('chat routing', () => {
    it('reads /chat as the list, not as a room', () => {
        expect(getChatLocationState({ pathname: '/chat' })).toEqual({ isChat: true, isHome: true, spaceId: '' })
        expect(getChatLocationState({ pathname: '/chat/' })).toEqual({ isChat: true, isHome: true, spaceId: '' })
    })

    it('reads /chat/{space} as that space’s room', () => {
        expect(getChatLocationState({ pathname: '/chat/main' })).toEqual({ isChat: true, isHome: false, spaceId: 'main' })
        expect(getChatLocationState({ pathname: '/chat/dilijan' })).toEqual({ isChat: true, isHome: false, spaceId: 'dilijan' })
    })

    // The address the room had before the list existed. Links to it are out
    // there — in the wiki's history, in somebody's messages — and a link that
    // used to open a room must not start opening nothing.
    it('still reads the old /{space}/chat as the same room', () => {
        expect(getChatLocationState({ pathname: '/dilijan/chat' })).toEqual({ isChat: true, isHome: false, spaceId: 'dilijan' })
    })

    it('claims neither a deeper path nor a project called chat-something', () => {
        expect(getChatLocationState({ pathname: '/main/chat/extra' }).isChat).toBe(false)
        expect(getChatLocationState({ pathname: '/main/chatter' }).isChat).toBe(false)
        expect(getChatLocationState({ pathname: '/' }).isChat).toBe(false)
    })

    // The room lives UNDER /chat because the service worker's scope is `/chat`,
    // and a scope does not cover `/main/chat`. An installed app whose rooms sit
    // outside its own scope has no worker on the page people actually use.
    it('builds room addresses inside the installed scope', () => {
        expect(buildChatHomePath()).toBe('/chat')
        expect(buildChatPath()).toBe('/chat/main')
        expect(buildChatPath('main')).toBe('/chat/main')
        expect(buildChatPath('dilijan')).toBe('/chat/dilijan')
        expect(buildChatPath('dilijan').startsWith(buildChatHomePath())).toBe(true)
    })

    it('keeps a private conversation a query on the list, never a shareable path', () => {
        const path = buildPrivateChatPath('account-7', 'Emilya')
        expect(path.startsWith('/chat?')).toBe(true)
        expect(getChatLocationState({ pathname: '/chat' }).isHome).toBe(true)
        expect(getPrivateChatTarget({ search: path.slice(path.indexOf('?')) })).toBe('account-7')
        expect(getPrivateChatTarget({ search: '' })).toBeNull()
    })

    // The word has to be reserved in all four claimants or a space named `chat`
    // would live at an address that can never open it — the defect
    // shared/reservedSegments.cjs exists to prevent.
    it('is a reserved word on both sides of the mirror', () => {
        expect(isReservedAppSegment('chat')).toBe(true)
        expect(RESERVED_SPACE_SLUGS.has('chat')).toBe(true)
        expect(RESERVED_PROJECT_SLUGS.has('chat')).toBe(true)
    })
})
