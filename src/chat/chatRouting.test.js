import { describe, expect, it } from 'vitest'
import { buildChatPath, getChatLocationState } from './chatRouting.js'
import { isReservedAppSegment } from '../utils/spaceRouting.js'
import { RESERVED_PROJECT_SLUGS, RESERVED_SPACE_SLUGS } from '../../shared/reservedSegments.cjs'

describe('chat routing', () => {
    it('reads /chat as the studio room', () => {
        expect(getChatLocationState({ pathname: '/chat' })).toEqual({ isChat: true, spaceId: 'main' })
        expect(getChatLocationState({ pathname: '/chat/' })).toEqual({ isChat: true, spaceId: 'main' })
    })

    it('reads /{space}/chat as that space’s room', () => {
        expect(getChatLocationState({ pathname: '/dilijan/chat' })).toEqual({ isChat: true, spaceId: 'dilijan' })
    })

    it('claims neither a deeper path nor a project called chat-something', () => {
        expect(getChatLocationState({ pathname: '/main/chat/extra' }).isChat).toBe(false)
        expect(getChatLocationState({ pathname: '/main/chatter' }).isChat).toBe(false)
        expect(getChatLocationState({ pathname: '/' }).isChat).toBe(false)
    })

    it('builds the address the room is installed at', () => {
        expect(buildChatPath()).toBe('/chat')
        expect(buildChatPath('main')).toBe('/chat')
        expect(buildChatPath('dilijan')).toBe('/dilijan/chat')
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
