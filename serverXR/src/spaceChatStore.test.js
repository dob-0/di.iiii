// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('./db.js')
const { appendMessage, listRecent, removeMessage, clearSpace } = require('./spaceChatStore.js')

const line = (id, spaceId, text, ts, userId = 'kid-1') => ({
    id, spaceId, userId, userName: 'Kid One', text, ts
})

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('spaceChatStore', () => {
    it('replays the LAST N lines oldest-first, per space', () => {
        for (let i = 0; i < 10; i++) {
            appendMessage(line(`m-${i}`, 'dilijan', `line ${i}`, 1000 + i))
        }
        appendMessage(line('m-x', 'other-space', 'elsewhere', 2000))

        const recent = listRecent('dilijan', { limit: 3 })
        expect(recent.map((m) => m.text)).toEqual(['line 7', 'line 8', 'line 9'])
        expect(recent.map((m) => m.id)).toEqual(['m-7', 'm-8', 'm-9'])
        expect(recent[0].userName).toBe('Kid One')
        expect(recent[0].timestamp).toBe(1007)
        expect(listRecent('other-space')).toHaveLength(1)
    })

    it('prunes past the keep cap so a week-long room stays bounded', () => {
        for (let i = 0; i < 12; i++) {
            appendMessage(line(`m-${i}`, 'dilijan', `line ${i}`, 1000 + i), { keep: 5 })
        }
        const all = listRecent('dilijan', { limit: 500 })
        expect(all).toHaveLength(5)
        expect(all[0].text).toBe('line 7')
    })

    it('removes one message by id and leaves the rest', () => {
        appendMessage(line('m-1', 'dilijan', 'keep me', 1000))
        appendMessage(line('m-2', 'dilijan', 'take this down', 1001))
        expect(removeMessage('dilijan', 'm-2')).toBe(true)
        expect(listRecent('dilijan').map((m) => m.id)).toEqual(['m-1'])
        expect(removeMessage('dilijan', 'm-2')).toBe(false)
    })

    // An admin scoped to one space must not reach into another space's room by
    // guessing an id.
    it('will not remove a message that belongs to a different space', () => {
        appendMessage(line('m-1', 'other-space', 'not yours', 1000))
        expect(removeMessage('dilijan', 'm-1')).toBe(false)
        expect(listRecent('other-space')).toHaveLength(1)
    })

    it('clears a whole space', () => {
        appendMessage(line('m-1', 'dilijan', 'a', 1000))
        appendMessage(line('m-2', 'dilijan', 'b', 1001))
        appendMessage(line('m-3', 'other-space', 'c', 1002))
        expect(clearSpace('dilijan')).toBe(2)
        expect(listRecent('dilijan')).toHaveLength(0)
        expect(listRecent('other-space')).toHaveLength(1)
    })

    it('rejects a line with no id, space or text', () => {
        expect(appendMessage({ spaceId: 'dilijan', text: 'x', ts: 1 })).toBe(false)
        expect(appendMessage({ id: 'm', text: 'x', ts: 1 })).toBe(false)
        expect(appendMessage({ id: 'm', spaceId: 'dilijan', text: '', ts: 1 })).toBe(false)
        expect(listRecent('dilijan')).toHaveLength(0)
    })
})
