import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPlatformHostname, resolveHostSpace, getHostSpace, setHostSpace } from './hostSpace.js'
import {
    buildAppSpacePath,
    buildPublicProjectPath,
    buildSpaceContentsPath,
    buildVanityProjectPath,
    getAppLocationState,
    getPlatformRedirect
} from './spaceRouting.js'

// A space on its own domain — docs/architecture/SPEC_space_own_domain.md.
const TARON = { id: 'taronx', slug: null, label: 'taronx', platformOrigin: 'https://diiii.xyz' }
const at = (pathname, search = '') => ({ pathname, search })

afterEach(() => setHostSpace(null))

describe('which hosts ask the server', () => {
    it('never asks on di.iiii’s own addresses or a local machine', () => {
        for (const host of ['diiii.xyz', 'dev.diiii.xyz', 'di-studio.xyz', 'local.thedi.studio', 'localhost',
            'aylmo.local', 'machine.tail1234.ts.net', '192.168.1.20', 'di']) {
            expect(isPlatformHostname(host), host).toBe(true)
        }
    })

    it('asks on any other domain', () => {
        expect(isPlatformHostname('yokozo.xyz')).toBe(false)
        expect(isPlatformHostname('www.yokozo.xyz')).toBe(false)
        expect(isPlatformHostname('notdiiii.xyz')).toBe(false)
    })
})

describe('resolveHostSpace', () => {
    it('remembers the space the server names', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ space: { id: 'taronx', slug: null, label: 'Taron' }, platformOrigin: 'https://diiii.xyz' }) }))
        await resolveHostSpace({ hostname: 'yokozo.xyz', fetchImpl })
        expect(fetchImpl).toHaveBeenCalledWith('/serverXR/api/host', { credentials: 'omit' })
        expect(getHostSpace()).toEqual({ id: 'taronx', slug: null, label: 'Taron', platformOrigin: 'https://diiii.xyz' })
    })

    it('makes no request on the platform', async () => {
        const fetchImpl = vi.fn()
        expect(await resolveHostSpace({ hostname: 'diiii.xyz', fetchImpl })).toBe(null)
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    // A domain that is not live, a server that is down: the page renders as
    // the platform, which is what it did before this existed.
    it('falls back to the platform on null, an error status or a thrown fetch', async () => {
        for (const fetchImpl of [
            async () => ({ ok: true, json: async () => ({ space: null }) }),
            async () => ({ ok: false, json: async () => ({}) }),
            async () => { throw new Error('offline') }
        ]) {
            expect(await resolveHostSpace({ hostname: 'yokozo.xyz', fetchImpl })).toBe(null)
            expect(getHostSpace()).toBe(null)
        }
    })
})

describe('reading an address on a space’s own domain', () => {
    it('reads / as the space and /x as its project', () => {
        setHostSpace(TARON)
        expect(getAppLocationState(at('/'))).toMatchObject({ spaceId: 'taronx' })
        expect(getAppLocationState(at('/taronx-instruments'))).toMatchObject({ spaceId: 'taronx', projectSlugSegment: 'taronx-instruments' })
        expect(getAppLocationState(at('/p/abc123'))).toMatchObject({ spaceId: 'taronx', projectId: 'abc123' })
        expect(getAppLocationState(at('/projects'))).toMatchObject({ page: 'space-contents', spaceId: 'taronx' })
    })

    it('still reads a link built the long way', () => {
        setHostSpace(TARON)
        expect(getAppLocationState(at('/taronx/taronx-instruments'))).toMatchObject({ spaceId: 'taronx', projectSlugSegment: 'taronx-instruments' })
    })

    it('reads the platform exactly as before when there is no host space', () => {
        expect(getAppLocationState(at('/'))).toMatchObject({ spaceId: null })
        expect(getAppLocationState(at('/taronx'))).toMatchObject({ spaceId: 'taronx' })
    })
})

describe('building a link on a space’s own domain', () => {
    it('leaves the space out, so a link made on the domain stays on it', () => {
        setHostSpace(TARON)
        expect(buildAppSpacePath('taronx')).toBe('/')
        expect(buildVanityProjectPath('taronx', 'taronx-instruments')).toBe('/taronx-instruments')
        expect(buildPublicProjectPath('taronx', 'abc123')).toBe('/p/abc123')
        expect(buildSpaceContentsPath('taronx')).toBe('/projects')
    })

    it('leaves another space’s link whole', () => {
        setHostSpace(TARON)
        expect(buildAppSpacePath('open')).toBe('/open')
        expect(buildVanityProjectPath('taronxyz', 'a')).toBe('/taronxyz/a')
    })

    it('honours the space’s public slug too', () => {
        setHostSpace({ ...TARON, slug: 'taron' })
        expect(buildVanityProjectPath('taron', 'a')).toBe('/a')
        expect(getAppLocationState(at('/taron/a'))).toMatchObject({ spaceId: 'taron', projectSlugSegment: 'a' })
    })
})

describe('editing goes to the platform', () => {
    it('sends editor and platform pages to the same place on diiii.xyz', () => {
        setHostSpace(TARON)
        expect(getPlatformRedirect(at('/studio'))).toBe('https://diiii.xyz/studio')
        expect(getPlatformRedirect(at('/wiki'))).toBe('https://diiii.xyz/wiki')
        expect(getPlatformRedirect(at('/login', '?next=1'))).toBe('https://diiii.xyz/login?next=1')
        expect(getPlatformRedirect(at('/admin'))).toBe('https://diiii.xyz/taronx/admin')
        expect(getPlatformRedirect(at('/taronx-instruments/studio'))).toBe('https://diiii.xyz/taronx/taronx-instruments/studio')
        expect(getPlatformRedirect(at('/p/abc123/raw'))).toBe('https://diiii.xyz/taronx/p/abc123/raw')
    })

    it('serves what a visitor sees', () => {
        setHostSpace(TARON)
        for (const path of ['/', '/taronx-instruments', '/p/abc123', '/projects', '/taronx']) {
            expect(getPlatformRedirect(at(path)), path).toBe(null)
        }
    })

    it('never redirects on the platform itself', () => {
        expect(getPlatformRedirect(at('/studio'))).toBe(null)
    })
})
