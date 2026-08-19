// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb } = require('./db.js')
const { appendLine, listRecent } = require('./meshRoomHistoryStore.js')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('meshRoomHistoryStore', () => {
  it('keeps lines per room and replays the LAST N oldest-first, ids intact', () => {
    for (let i = 0; i < 10; i++) {
      appendLine(`id-${i}`, 'room-a', 'talk', `n${i}`, { text: `line ${i}` }, 1000 + i)
    }
    appendLine('id-x', 'room-b', 'talk', 'other', { text: 'elsewhere' }, 2000)

    const recent = listRecent('room-a', { limit: 3 })
    expect(recent.map(l => l.payload.text)).toEqual(['line 7', 'line 8', 'line 9'])
    expect(recent.map(l => l.id)).toEqual(['id-7', 'id-8', 'id-9'])
    expect(recent[0].from).toBe('n7')
    expect(recent[0].channel).toBe('talk')
    expect(listRecent('room-b').length).toBe(1)
  })

  it('prunes a room past its cap without touching other rooms', () => {
    for (let i = 0; i < 30; i++) {
      appendLine(`b-${i}`, 'busy', 'talk', 'n', { i }, i, { keep: 20 })
    }
    appendLine('c-0', 'calm', 'talk', 'n', { i: 0 }, 0, { keep: 20 })

    const busy = listRecent('busy', { limit: 100 })
    expect(busy.length).toBe(20)
    expect(busy[0].payload.i).toBe(10)
    expect(listRecent('calm', { limit: 100 }).length).toBe(1)
  })

  it('refuses a line without an id — identity is the dedupe contract', () => {
    expect(appendLine('', 'room-a', 'talk', 'n', { ok: true }, 1)).toBe(false)
    expect(listRecent('room-a')).toEqual([])
  })
})
