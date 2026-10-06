// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const store = require('./domainStore.js')

const addSpace = (id) => {
    const now = Date.now()
    getDb().prepare('INSERT INTO spaces (id, label, created_at, updated_at, last_touched_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, id, now, now, now)
}

beforeEach(() => { initDb(':memory:'); addSpace('taronx'); addSpace('other') })
afterEach(() => { closeDb() })

describe('normalizeHostname', () => {
    it('keeps a plain domain as DNS carries it', () => {
        expect(store.normalizeHostname('yokozo.xyz')).toBe('yokozo.xyz')
        expect(store.normalizeHostname('  WWW.Yokozo.XYZ. ')).toBe('www.yokozo.xyz')
    })

    // People paste what is in their address bar.
    it('takes the host out of a pasted address', () => {
        expect(store.normalizeHostname('https://yokozo.xyz/taronx-instruments?x=1')).toBe('yokozo.xyz')
        expect(store.normalizeHostname('http://yokozo.xyz:8080')).toBe('yokozo.xyz')
    })

    it('stores an internationalised name in punycode', () => {
        expect(store.normalizeHostname('բարև.am')).toMatch(/^xn--[a-z0-9-]+\.am$/)
    })

    it('refuses what is not a hostname we could serve', () => {
        for (const junk of ['', 'localhost', 'yokozo', '192.168.1.1', '-bad.xyz', 'bad-.xyz', 'a..b', 'a b.xyz',
            `${'a'.repeat(64)}.xyz`, null, undefined]) {
            expect(store.normalizeHostname(junk), String(junk)).toBe(null)
        }
    })
})

describe('isUnder', () => {
    it('matches the name and names below it, not names that merely end the same', () => {
        expect(store.isUnder('diiii.xyz', 'diiii.xyz')).toBe(true)
        expect(store.isUnder('dev.diiii.xyz', 'diiii.xyz')).toBe(true)
        expect(store.isUnder('notdiiii.xyz', 'diiii.xyz')).toBe(false)
    })
})

describe('the host lookup', () => {
    it('answers only for an active domain', () => {
        store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'taronx' })
        expect(store.findActiveSpaceIdForHost('yokozo.xyz')).toBe(null)
        store.updateDomain('yokozo.xyz', { state: 'active' })
        expect(store.findActiveSpaceIdForHost('YOKOZO.xyz')).toBe('taronx')
        store.updateDomain('yokozo.xyz', { state: 'pending' })
        expect(store.findActiveSpaceIdForHost('yokozo.xyz')).toBe(null)
    })

    it('stamps active_since on entering active and clears it on leaving', () => {
        store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'taronx' })
        const live = store.updateDomain('yokozo.xyz', { state: 'active' })
        expect(live.activeSince).toBeGreaterThan(0)
        const again = store.updateDomain('yokozo.xyz', { records: [] })
        expect(again.activeSince).toBe(live.activeSince)
        expect(store.updateDomain('yokozo.xyz', { state: 'pending' }).activeSince).toBe(null)
    })

    it('one hostname belongs to one space', () => {
        store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'taronx' })
        expect(() => store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'other' })).toThrow()
    })

    it('goes when its space goes', () => {
        store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'taronx' })
        getDb().prepare('DELETE FROM spaces WHERE id = ?').run('taronx')
        expect(store.getDomain('yokozo.xyz')).toBe(null)
    })

    it('keeps the records owed as a list', () => {
        store.insertDomain({ hostname: 'yokozo.xyz', spaceId: 'taronx' })
        const records = [{ type: 'CNAME', name: 'yokozo.xyz', value: 'domains.diiii.xyz' }]
        expect(store.updateDomain('yokozo.xyz', { records }).records).toEqual(records)
        expect(store.listDomainsForSpace('taronx')).toHaveLength(1)
        expect(store.listDomainsInState('pending')).toHaveLength(1)
    })
})
