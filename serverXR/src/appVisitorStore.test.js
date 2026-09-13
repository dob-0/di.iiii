// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const { createGuestBook, OVERFLOW_AGENT } = require('./appVisitorStore.js')

const DAY = 24 * 60 * 60 * 1000
const NOON = Date.parse('2026-09-13T12:00:00Z')

const curl = { kind: 'anonymous', name: 'curl', contact: null }
const mirror = { kind: 'app', name: 'spacemirror', contact: 'ops@example.org' }
const gptbot = { kind: 'crawler', name: 'gptbot', contact: null }
const browser = { kind: 'browser', name: 'browser', contact: null }

describe('the guest book', () => {
    let clock
    let book
    beforeEach(() => {
        initDb(':memory:')
        clock = NOON
        book = createGuestBook({ getDb, now: () => clock, log: { warn: () => {} } })
    })
    afterEach(() => { closeDb() })

    it('tallies requests per name and kind, with today and the last seven days', () => {
        book.record(curl)
        book.record(curl)
        book.record(mirror)
        clock = NOON - 3 * DAY
        book.record(mirror) // an earlier day, recorded late: still its own row
        clock = NOON
        const { agents, totals } = book.summary()
        const byName = Object.fromEntries(agents.map((a) => [a.agent, a]))
        expect(byName.curl).toMatchObject({ kind: 'anonymous', today: 2, week: 2, contact: null, blocked: false })
        expect(byName.spacemirror).toMatchObject({ kind: 'app', today: 1, week: 2, contact: 'ops@example.org' })
        expect(totals.anonymous.today).toBe(2)
    })

    // The privacy contract, as a test: the only things a row may hold.
    it('stores aggregates only — no column can carry an address, a URL or a person', () => {
        book.record(curl)
        book.flush()
        const columns = getDb().prepare('PRAGMA table_info(app_visitor_days)').all().map((c) => c.name).sort()
        expect(columns).toEqual(['agent', 'contact', 'day', 'first_seen', 'kind', 'last_seen', 'requests'])
    })

    it('keeps a browser as one daily number with no timestamps', () => {
        book.record(browser)
        book.record(browser)
        book.flush()
        const rows = getDb().prepare("SELECT * FROM app_visitor_days WHERE kind = 'browser'").all()
        expect(rows).toEqual([{ day: '2026-09-13', agent: 'browser', kind: 'browser', requests: 2, contact: null, first_seen: null, last_seen: null }])
    })

    it('never stores a contact for anything but an identified app', () => {
        book.record({ kind: 'crawler', name: 'gptbot', contact: 'https://openai.com/gptbot' })
        book.flush()
        expect(getDb().prepare('SELECT contact FROM app_visitor_days').get().contact).toBeNull()
    })

    it('adds up across flushes and moves last_seen on', () => {
        book.record(gptbot)
        book.flush()
        clock = NOON + 60_000
        book.record(gptbot)
        book.flush()
        const row = getDb().prepare('SELECT * FROM app_visitor_days').get()
        expect(row).toMatchObject({ requests: 2, first_seen: NOON, last_seen: NOON + 60_000 })
    })

    // A caller picks its own name, and can pick a new one every request.
    it('caps distinct names per day and folds the rest into one row', () => {
        const capped = createGuestBook({ getDb, now: () => clock, maxAgentsPerDay: 3 })
        for (let i = 0; i < 10; i += 1) capped.record({ kind: 'anonymous', name: `tool-${i}`, contact: null })
        capped.flush()
        const rows = getDb().prepare('SELECT agent, requests FROM app_visitor_days ORDER BY agent').all()
        expect(rows.length).toBe(4)
        expect(rows.find((r) => r.agent === OVERFLOW_AGENT).requests).toBe(7)
    })

    it('honours the cap across a restart, from what is already on disk', () => {
        const first = createGuestBook({ getDb, now: () => clock, maxAgentsPerDay: 2 })
        first.record({ kind: 'anonymous', name: 'a', contact: null })
        first.record({ kind: 'anonymous', name: 'b', contact: null })
        first.flush()
        const second = createGuestBook({ getDb, now: () => clock, maxAgentsPerDay: 2 })
        second.record({ kind: 'anonymous', name: 'c', contact: null })
        second.flush()
        const agents = getDb().prepare('SELECT agent FROM app_visitor_days ORDER BY agent').all().map((r) => r.agent)
        expect(agents).toEqual([OVERFLOW_AGENT, 'a', 'b'])
    })

    it('forgets days older than the retention window', () => {
        clock = NOON - 100 * DAY
        book.record(curl)
        book.flush()
        clock = NOON
        const fresh = createGuestBook({ getDb, now: () => clock })
        fresh.record(curl)
        fresh.flush()
        const days = getDb().prepare('SELECT day FROM app_visitor_days').all().map((r) => r.day)
        expect(days).toEqual(['2026-09-13'])
    })

    it('blocks and unblocks by name, and lists a blocked name that has gone quiet', () => {
        book.setBlocked('python-requests', true)
        expect(book.isBlocked('python-requests')).toBe(true)
        expect(book.summary().agents).toContainEqual(expect.objectContaining({ agent: 'python-requests', blocked: true }))
        book.setBlocked('python-requests', false)
        expect(book.isBlocked('python-requests')).toBe(false)
    })

    it('refuses to block every browser, or the fold-over row', () => {
        expect(() => book.setBlocked('browser', true)).toThrow(/cannot be blocked/)
        expect(() => book.setBlocked(OVERFLOW_AGENT, true)).toThrow(/cannot be blocked/)
        expect(() => book.setBlocked('', true)).toThrow()
    })
})
