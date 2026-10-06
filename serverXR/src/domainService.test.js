// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const store = require('./domainStore.js')
const { createDomainService } = require('./domainService.js')
const { CloudflareError, recordsOwed, stateOf } = require('./cloudflareSaas.js')

const addSpace = (id) => {
    const now = Date.now()
    getDb().prepare('INSERT INTO spaces (id, label, is_public, created_at, updated_at, last_touched_at) VALUES (?, ?, 1, ?, ?, ?)')
        .run(id, id, now, now, now)
}

const PUBLIC = { id: 'taronx', isPublic: true }
const PLATFORM = ['diiii.xyz', 'di-studio.xyz', 'thedi.studio', 'localhost']

// A stand-in for Cloudflare's custom hostname API, shaped like its real answers
// (https://developers.cloudflare.com/api/resources/custom_hostnames/).
const fakeCloudflare = () => {
    const hostnames = new Map()
    let next = 1
    return {
        hostnames,
        cnameTarget: 'domains.diiii.xyz',
        create: vi.fn(async (hostname) => {
            if ([...hostnames.values()].some((h) => h.hostname === hostname)) {
                throw new CloudflareError('Cloudflare refused: 1406: Duplicate custom hostname found.', { status: 409, codes: [1406] })
            }
            const record = {
                id: `cf-${next++}`,
                hostname,
                status: 'pending',
                ownership_verification: { type: 'txt', name: `_cf-custom-hostname.${hostname}`, value: 'owner-token' },
                ssl: { status: 'pending_validation', validation_records: [] }
            }
            hostnames.set(record.id, record)
            return record
        }),
        get: vi.fn(async (id) => {
            const record = hostnames.get(id)
            if (!record) throw new CloudflareError('Cloudflare refused: not found', { status: 404 })
            return record
        }),
        findByHostname: vi.fn(async (hostname) => [...hostnames.values()].find((h) => h.hostname === hostname) || null),
        remove: vi.fn(async (id) => {
            if (!hostnames.delete(id)) throw new CloudflareError('Cloudflare refused: not found', { status: 404 })
            return { id }
        }),
        goLive(hostname) {
            const record = [...hostnames.values()].find((h) => h.hostname === hostname)
            record.status = 'active'
            record.ssl = { status: 'active' }
        }
    }
}

const quiet = { info: () => {}, warn: () => {} }

beforeEach(() => { initDb(':memory:'); addSpace('taronx'); addSpace('other') })
afterEach(() => { closeDb() })

describe('adding a domain', () => {
    it('registers it with Cloudflare and says what DNS is still owed', async () => {
        const cloudflare = fakeCloudflare()
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, logger: quiet })
        const { domain } = await service.add({ spaceMeta: PUBLIC, hostname: 'https://Yokozo.xyz/', addedBy: 'taron' })
        expect(cloudflare.create).toHaveBeenCalledWith('yokozo.xyz')
        expect(domain).toMatchObject({ hostname: 'yokozo.xyz', spaceId: 'taronx', state: 'pending', live: false, connected: true })
        expect(domain.records).toEqual([
            { type: 'CNAME', name: 'yokozo.xyz', value: 'domains.diiii.xyz', why: 'points the domain at di.iiii' },
            { type: 'TXT', name: '_cf-custom-hostname.yokozo.xyz', value: 'owner-token', why: 'proves the domain is yours' }
        ])
        expect(store.findActiveSpaceIdForHost('yokozo.xyz')).toBe(null)
    })

    it('refuses di.iiii’s own names, so a space cannot take over part of the platform', async () => {
        const service = createDomainService({ cloudflare: fakeCloudflare(), platformSuffixes: [...PLATFORM, 'domains.diiii.xyz'], logger: quiet })
        for (const hostname of ['diiii.xyz', 'dev.diiii.xyz', 'www.di-studio.xyz', 'thedi.studio']) {
            expect((await service.add({ spaceMeta: PUBLIC, hostname })).error, hostname).toBe('platform_hostname')
        }
    })

    it('refuses a private space: there is nothing to show on the open internet', async () => {
        const service = createDomainService({ cloudflare: fakeCloudflare(), platformSuffixes: PLATFORM, logger: quiet })
        const result = await service.add({ spaceMeta: { id: 'taronx', isPublic: false }, hostname: 'yokozo.xyz' })
        expect(result).toMatchObject({ error: 'space_not_public', status: 409 })
    })

    it('refuses a domain another space already has, and is idempotent for the same space', async () => {
        const service = createDomainService({ cloudflare: fakeCloudflare(), platformSuffixes: PLATFORM, logger: quiet })
        await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        expect((await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })).domain.hostname).toBe('yokozo.xyz')
        expect((await service.add({ spaceMeta: { id: 'other', isPublic: true }, hostname: 'yokozo.xyz' })).error).toBe('hostname_taken')
    })

    it('holds the per-space and platform limits', async () => {
        const service = createDomainService({ cloudflare: fakeCloudflare(), platformSuffixes: PLATFORM, maxPerSpace: 2, maxDomains: 3, logger: quiet })
        await service.add({ spaceMeta: PUBLIC, hostname: 'a.xyz' })
        await service.add({ spaceMeta: PUBLIC, hostname: 'b.xyz' })
        expect((await service.add({ spaceMeta: PUBLIC, hostname: 'c.xyz' })).error).toBe('space_domain_limit')
        await service.add({ spaceMeta: { id: 'other', isPublic: true }, hostname: 'c.xyz' })
        expect((await service.add({ spaceMeta: { id: 'other', isPublic: true }, hostname: 'd.xyz' })).error).toBe('platform_domain_limit')
    })

    it('adopts a hostname Cloudflare already has instead of failing for ever', async () => {
        const cloudflare = fakeCloudflare()
        await cloudflare.create('yokozo.xyz')
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, logger: quiet })
        const { domain } = await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        expect(domain.state).toBe('pending')
        expect(store.getDomain('yokozo.xyz').cloudflareId).toBe('cf-1')
    })

    it('saves nothing when Cloudflare refuses, so the owner can simply try again', async () => {
        const cloudflare = fakeCloudflare()
        cloudflare.create.mockRejectedValueOnce(new CloudflareError('Cloudflare refused: 1414: hostname not allowed', { status: 400, codes: [1414] }))
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, logger: quiet })
        expect(await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })).toMatchObject({ error: 'cloudflare_refused', status: 502 })
        expect(store.getDomain('yokozo.xyz')).toBe(null)
    })
})

describe('switching on with no hands', () => {
    it('the sweep turns a domain live once Cloudflare says DNS and the certificate are in place', async () => {
        const cloudflare = fakeCloudflare()
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, logger: quiet })
        await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        expect((await service.sweep()).activated).toBe(0)
        cloudflare.goLive('yokozo.xyz')
        expect(await service.sweep()).toMatchObject({ activated: 1, dropped: 0 })
        expect(store.findActiveSpaceIdForHost('yokozo.xyz')).toBe('taronx')
        // Once live, only the CNAME remains in the list — as a reminder, not a task.
        expect(service.list('taronx')[0].records).toHaveLength(1)
    })

    it('drops a domain nobody pointed at us within the window, at Cloudflare too', async () => {
        const cloudflare = fakeCloudflare()
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, pendingTtlMs: 1000, logger: quiet })
        await service.add({ spaceMeta: PUBLIC, hostname: 'squatted.xyz' })
        getDb().prepare('UPDATE space_domains SET created_at = ?').run(Date.now() - 5000)
        expect(await service.sweep()).toMatchObject({ dropped: 1 })
        expect(store.getDomain('squatted.xyz')).toBe(null)
        expect(cloudflare.hostnames.size).toBe(0)
    })

    it('says plainly when Cloudflare has lost the hostname', async () => {
        const cloudflare = fakeCloudflare()
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, logger: quiet })
        await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        cloudflare.hostnames.clear()
        const { domain } = await service.check({ spaceId: 'taronx', hostname: 'yokozo.xyz' })
        expect(domain.state).toBe('failed')
        expect(domain.lastError).toMatch(/no longer has this domain/)
    })
})

describe('removing a domain', () => {
    it('takes it off the space and off Cloudflare, and only for its own space', async () => {
        const cloudflare = fakeCloudflare()
        const service = createDomainService({ cloudflare, platformSuffixes: PLATFORM, logger: quiet })
        await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        expect((await service.remove({ spaceId: 'other', hostname: 'yokozo.xyz' })).error).toBe('not_found')
        expect(await service.remove({ spaceId: 'taronx', hostname: 'yokozo.xyz' })).toEqual({ removed: 'yokozo.xyz' })
        expect(cloudflare.remove).toHaveBeenCalledWith('cf-1')
        expect(store.getDomain('yokozo.xyz')).toBe(null)
    })
})

describe('without Cloudflare', () => {
    it('saves the domain as unmanaged and lets an admin say it is live', async () => {
        const service = createDomainService({ cloudflare: null, platformSuffixes: PLATFORM, logger: quiet })
        const { domain } = await service.add({ spaceMeta: PUBLIC, hostname: 'yokozo.xyz' })
        expect(domain).toMatchObject({ state: 'unmanaged', connected: false })
        expect(store.findActiveSpaceIdForHost('yokozo.xyz')).toBe(null)
        await service.check({ spaceId: 'taronx', hostname: 'yokozo.xyz', setState: 'active' })
        expect(store.findActiveSpaceIdForHost('yokozo.xyz')).toBe('taronx')
        expect(await service.sweep()).toEqual({ checked: 0, activated: 0, dropped: 0 })
    })
})

describe('reading Cloudflare’s answer', () => {
    it('is live only when both the hostname and its certificate are', () => {
        expect(stateOf({ status: 'active', ssl: { status: 'pending_validation' } })).toBe('pending')
        expect(stateOf({ status: 'active', ssl: { status: 'active' } })).toBe('active')
        expect(stateOf({ status: 'blocked', ssl: { status: 'active' } })).toBe('failed')
    })

    it('lists certificate TXT records only while the certificate is pending', () => {
        const pending = { status: 'pending', ssl: { status: 'pending_validation', validation_records: [{ txt_name: '_acme-challenge.x.xyz', txt_value: 'abc' }] } }
        expect(recordsOwed('x.xyz', pending, 't').map((r) => r.type)).toEqual(['CNAME', 'TXT'])
        expect(recordsOwed('x.xyz', { status: 'active', ssl: { status: 'active' } }, 't').map((r) => r.type)).toEqual(['CNAME'])
    })
})
