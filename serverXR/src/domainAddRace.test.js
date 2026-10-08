// @vitest-environment node
//
// domainService.add() used to check for an existing row, then AWAIT Cloudflare, then insert. space_domains.hostname is
// the PRIMARY KEY and insertDomain is a plain INSERT, so a second add() for the same hostname that started inside that
// window threw a constraint error — a 500 from the route for a domain that is in fact registered (a double click, a
// retry after a slow answer), or for two spaces typing one name. The name is now reserved before the first await.
// Same harness as domainService.test.js: a real in-memory SQLite and a fake Cloudflare shaped like the real API.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const store = require('./domainStore.js')
const { createDomainService } = require('./domainService.js')
const { CloudflareError } = require('./cloudflareSaas.js')

const addSpace = (id) => {
    const now = Date.now()
    getDb().prepare('INSERT INTO spaces (id, label, is_public, created_at, updated_at, last_touched_at) VALUES (?, ?, 1, ?, ?, ?)')
        .run(id, id, now, now, now)
}
const PUBLIC = { id: 'taronx', isPublic: true }
const OTHER = { id: 'other', isPublic: true }
const PLATFORM = ['diiii.xyz', 'di-studio.xyz', 'thedi.studio', 'localhost']

const fakeCloudflare = () => {
    const hostnames = new Map()
    let next = 1
    return {
        hostnames,
        cnameTarget: 'domains.diiii.xyz',
        // A real API call takes time: yield before answering, as a network round trip does.
        create: vi.fn(async (hostname) => {
            await new Promise((resolve) => setTimeout(resolve, 5))
            if ([...hostnames.values()].some((h) => h.hostname === hostname)) {
                throw new CloudflareError('Cloudflare refused: 1406: Duplicate custom hostname found.', { status: 409, codes: [1406] })
            }
            const record = {
                id: `cf-${next++}`, hostname, status: 'pending',
                ownership_verification: { type: 'txt', name: `_cf-custom-hostname.${hostname}`, value: 'owner-token' },
                ssl: { status: 'pending_validation', validation_records: [] }
            }
            hostnames.set(record.id, record)
            return record
        }),
        get: vi.fn(async (id) => hostnames.get(id)),
        findByHostname: vi.fn(async (hostname) => [...hostnames.values()].find((h) => h.hostname === hostname) || null),
        remove: vi.fn(async (id) => { hostnames.delete(id); return { id } })
    }
}
const quiet = { info: () => {}, warn: () => {} }

beforeEach(() => { initDb(':memory:'); addSpace('taronx'); addSpace('other') })
afterEach(() => { closeDb() })

describe('adding the same domain twice at once', () => {
    it('is idempotent for the same space (a double click must not become a 500)', async () => {
        const service = createDomainService({ cloudflare: fakeCloudflare(), platformSuffixes: PLATFORM, logger: quiet })
        const results = await Promise.allSettled([
            service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' }),
            service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        ])
        expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
        expect(store.countDomains()).toBe(1)
    })

    it('gives the name to one space and a clean hostname_taken to the other', async () => {
        const service = createDomainService({ cloudflare: fakeCloudflare(), platformSuffixes: PLATFORM, logger: quiet })
        const results = await Promise.allSettled([
            service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' }),
            service.add({ spaceMeta: OTHER, hostname: 'yokozo.xyz' })
        ])
        expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
        const wins = results.filter((r) => r.value.domain)
        expect(wins).toHaveLength(1)
        expect(results.find((r) => r.value.error)?.value.error).toBe('hostname_taken')
        expect(store.countDomains()).toBe(1)
    })

    it('gives the name back when Cloudflare refuses it, so it can be added again', async () => {
        const cloudflare = fakeCloudflare()
        cloudflare.create.mockRejectedValueOnce(new CloudflareError('Cloudflare refused: 1000: bad hostname', { status: 400, codes: [1000] }))
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, logger: quiet })
        const refused = await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        expect(refused.error).toBe('cloudflare_refused')
        expect(store.getDomain('yokozo.xyz')).toBe(null)
        const again = await service.add({ spaceMeta: OTHER, hostname: 'yokozo.xyz' })
        expect(again.domain.spaceId).toBe('other')
    })
})
