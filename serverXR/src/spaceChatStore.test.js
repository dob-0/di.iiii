// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('./db.js')
const {
    appendMessage, listRecent, getMessage, removeMessage, setPin, getPin, clearPin, clearSpace
} = require('./spaceChatStore.js')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

const line = (id, extra = {}) => appendMessage({
    id, spaceId: 'main', userId: 'u1', userName: 'Someone', text: `line ${id}`, ts: Date.now(), ...extra
})

describe('a line that answers another line', () => {
    it('keeps its own copy of the quote, so an admin erasing the original leaves the answer readable', () => {
        line('a', { text: 'the door code is 4417' })
        line('b', { replyTo: { id: 'a', userName: 'Someone', text: 'the door code is 4417' } })

        removeMessage('main', 'a')
        const [answer] = listRecent('main')
        expect(answer.id).toBe('b')
        expect(answer.replyTo).toEqual({ id: 'a', userName: 'Someone', text: 'the door code is 4417' })
    })

    it('cuts a long quote rather than carrying the whole message inside the reply', () => {
        line('a', { text: 'x'.repeat(400) })
        line('b', { replyTo: { id: 'a', userName: 'Someone', text: 'x'.repeat(400) } })
        const answer = listRecent('main').find((message) => message.id === 'b')
        expect(answer.replyTo.text.length).toBe(160)
    })

    it('carries no reply at all when none was given', () => {
        line('a')
        expect(listRecent('main')[0].replyTo).toBeUndefined()
    })
})

describe('the account behind a line', () => {
    // It is the whole basis of "you may delete your own message": user_id is a
    // label a browser picked, account_id is what the server stamped.
    it('is kept, and is never handed to the room', () => {
        line('a', { accountId: 'account-7' })
        expect(getMessage('main', 'a').accountId).toBe('account-7')
        expect(listRecent('main')[0]).not.toHaveProperty('accountId')
    })
})

describe('the pin', () => {
    it('is one per room, and the last pin wins', () => {
        line('a')
        line('b')
        setPin('main', { messageId: 'a', pinnedBy: 'account-7', pinnedByName: 'Gevorg' })
        setPin('main', { messageId: 'b', pinnedBy: 'account-7', pinnedByName: 'Gevorg' })
        expect(getPin('main').message.id).toBe('b')
    })

    it('refuses to pin a message that is not in this room', () => {
        line('a')
        expect(setPin('main', { messageId: 'nowhere', pinnedBy: 'account-7' })).toBeNull()
        expect(setPin('other-space', { messageId: 'a', pinnedBy: 'account-7' })).toBeNull()
    })

    it('goes away with the message it pointed at, rather than leaving a bar over nothing', () => {
        line('a')
        setPin('main', { messageId: 'a', pinnedBy: 'account-7' })
        removeMessage('main', 'a')
        expect(getPin('main')).toBeNull()
    })

    it('never leaks the account of whoever wrote the pinned line', () => {
        line('a', { accountId: 'account-7' })
        setPin('main', { messageId: 'a', pinnedBy: 'account-7' })
        expect(getPin('main').message).not.toHaveProperty('accountId')
    })

    it('is dropped when the room is cleared, and can be dropped on its own', () => {
        line('a')
        setPin('main', { messageId: 'a', pinnedBy: 'account-7' })
        expect(clearPin('main')).toBe(true)
        expect(getPin('main')).toBeNull()

        line('b')
        setPin('main', { messageId: 'b', pinnedBy: 'account-7' })
        clearSpace('main')
        expect(getPin('main')).toBeNull()
    })

    it('is scoped to its room — two rooms hold two pins', () => {
        line('a')
        appendMessage({ id: 'z', spaceId: 'dilijan', userId: 'u2', userName: 'Other', text: 'hello', ts: Date.now() })
        setPin('main', { messageId: 'a', pinnedBy: 'account-7' })
        setPin('dilijan', { messageId: 'z', pinnedBy: 'account-9' })
        expect(getPin('main').message.id).toBe('a')
        expect(getPin('dilijan').message.id).toBe('z')
    })
})
