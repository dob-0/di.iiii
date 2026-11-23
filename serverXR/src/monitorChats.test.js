// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { chatsBlock, sanitizeChats, CHATS_MAX, CHATS_STALE_MS } = require('./monitorChats.js')

const NOW = 1_800_000_000_000
const sec = (agoMs = 0) => (NOW - agoMs) / 1000
const chat = (n, over = {}) => ({ title: `chat ${n}`, name: `c${n}`, sessionId: `sid-${n}`, status: 'idle', group: 'idle', idleMinutes: n, you: { time: 1, text: 'PRIVATE OWNER WORDS' }, says: { first: `says ${n}` }, asks: [], error: null, ...over })
const live = (chats, host = 'aylmo', agoMs = 5000) => [{ host, source: { v: 2, generatedAt: sec(agoMs), chats } }]

describe('chats block', () => {
  it('groups ask > working > idle and counts all of them', () => {
    const b = chatsBlock(live([
      chat(1), chat(2, { group: 'working', status: 'busy' }),
      chat(3, { group: 'ask', asks: ['!! Say done.'] }), chat(4, { group: 'idle', idleMinutes: 0 })
    ]), { now: NOW })
    expect(b.state).toBe('live')
    expect(b.rows.map((r) => r.group)).toEqual(['ask', 'working', 'idle', 'idle'])
    expect(b.rows[2].idleMinutes).toBe(0)
    expect(b.counts).toEqual({ ask: 1, working: 1, idle: 2, total: 4 })
  })

  it('never carries the owner message text or session paths', () => {
    const b = chatsBlock(live([chat(1, { cwd: '/home/x', you: { text: 'secret' } })]), { now: NOW })
    expect(JSON.stringify(b)).not.toMatch(/PRIVATE OWNER|secret|\/home\/x/)
    expect(JSON.stringify(sanitizeChats({ generatedAt: 1, chats: [chat(1)] }))).not.toMatch(/PRIVATE OWNER/)
  })

  it('caps rows at 60 but still counts every chat', () => {
    const b = chatsBlock(live(Array.from({ length: 80 }, (_, i) => chat(i + 1))), { now: NOW })
    expect(b.rows).toHaveLength(CHATS_MAX)
    expect(b.counts.total).toBe(80)
    expect(b.truncated).toBe(20)
  })

  it('a missing group falls back to the asks, then the status', () => {
    const b = chatsBlock(live([chat(1, { group: undefined, asks: ['?? yes or no'] }), chat(2, { group: undefined, status: 'busy' }), chat(3, { group: 'weird' })]), { now: NOW })
    expect(Object.fromEntries(b.rows.map((r) => [r.id, r.group]))).toEqual({ 'sid-1': 'ask', 'sid-2': 'working', 'sid-3': 'idle' })
  })

  it('an old source is stale (rows kept, flagged), never live and never empty-well', () => {
    const b = chatsBlock(live([chat(1)], 'aylmo', CHATS_STALE_MS + 1000), { now: NOW })
    expect(b).toMatchObject({ state: 'stale', ok: false })
    expect(b.rows).toHaveLength(1)
    expect(b.heardSecondsAgo).toBeGreaterThan(120)
  })

  it('no source at all is "none"; a failed read is "failed"; neither has rows', () => {
    expect(chatsBlock([], { now: NOW })).toMatchObject({ state: 'none', ok: false, rows: [], counts: { total: 0 } })
    expect(chatsBlock(undefined, { now: NOW }).state).toBe('none')
    expect(chatsBlock([{ host: 'a', source: null, error: 'timed out' }], { now: NOW })).toMatchObject({ state: 'failed', error: 'timed out' })
    expect(chatsBlock([{ host: 'a', source: { nope: true } }], { now: NOW }).state).toBe('none')
  })

  it('a fresh machine wins over a stale one; the same chat on two machines shows once', () => {
    const b = chatsBlock([...live([chat(1)], 'old', 600000), ...live([chat(2), chat(2)], 'new', 1000)], { now: NOW })
    expect(b.state).toBe('live')
    expect(b.rows.map((r) => r.id)).toEqual(['sid-2'])
  })

  it('cleaning twice keeps everything (a report is cleaned on arrival and again on the way out)', () => {
    const once = sanitizeChats({ generatedAt: sec(), chats: [chat(1, { group: 'ask', asks: ['!! Say done.'], error: 'x' })] }, 'aylmo')
    expect(sanitizeChats(once, 'aylmo')).toEqual(once)
    const b = chatsBlock([{ host: 'aylmo', source: once }], { now: NOW })
    expect(b.rows[0]).toMatchObject({ says: 'says 1', asks: ['!! Say done.'], failed: true, idleMinutes: 1 })
  })

  it('text is capped and control characters are dropped', () => {
    const b = chatsBlock(live([chat(1, { says: { first: `a${'x'.repeat(500)}${String.fromCharCode(7)}` } })]), { now: NOW })
    expect(b.rows[0].says.length).toBe(240)
    expect(b.rows[0].says.includes(String.fromCharCode(7))).toBe(false)
  })
})
