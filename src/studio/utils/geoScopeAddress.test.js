import { describe, expect, it } from 'vitest'
import { buildStudioGeoPath, readGeoIdFromSearch, withGeoQuery } from './geoScopeAddress.js'
import { getStudioLocationState } from './studioRouting.js'

describe('Studio inside a Geo — the address', () => {
    it('reads the Geo from ?geo=', () => {
        expect(readGeoIdFromSearch('?geo=node-abc123')).toBe('node-abc123')
        expect(readGeoIdFromSearch('geo=node-1&x=2')).toBe('node-1')
    })

    it('reads nothing when there is no Geo, or something that is not an id', () => {
        expect(readGeoIdFromSearch('')).toBeNull()
        expect(readGeoIdFromSearch('?other=1')).toBeNull()
        expect(readGeoIdFromSearch('?geo=')).toBeNull()
        expect(readGeoIdFromSearch('?geo=%3Cscript%3E')).toBeNull()
        expect(readGeoIdFromSearch(undefined)).toBeNull()
    })

    it('builds the project address with the Geo as a query', () => {
        expect(buildStudioGeoPath('p1', 'lab', 'node-9')).toBe('/lab/studio/projects/p1?geo=node-9')
        expect(buildStudioGeoPath('p1', null, 'node-9')).toBe('/studio/projects/p1?geo=node-9')
    })

    it('keeps the plain project address when no Geo is named', () => {
        expect(buildStudioGeoPath('p1', 'lab')).toBe('/lab/studio/projects/p1')
    })

    it('leaves the router reading the same project — the query never changes the route', () => {
        const plain = getStudioLocationState({ pathname: '/lab/studio/projects/p1', search: '' })
        const inGeo = getStudioLocationState({ pathname: '/lab/studio/projects/p1', search: '?geo=node-9' })
        expect(inGeo).toEqual(plain)
        expect(inGeo).toMatchObject({ isStudio: true, page: 'project', projectId: 'p1', spaceId: 'lab' })
    })

    it('round-trips: what it builds, it reads back', () => {
        const path = buildStudioGeoPath('p1', 'lab', 'node-xyz_1')
        expect(readGeoIdFromSearch(path.slice(path.indexOf('?')))).toBe('node-xyz_1')
    })

    it('switching Geo keeps the path and every other query parameter', () => {
        expect(withGeoQuery('/lab/studio/projects/p1', '', 'node-2')).toBe('/lab/studio/projects/p1?geo=node-2')
        expect(withGeoQuery('/lab/studio/projects/p1', '?preview=1&geo=node-1', 'node-2')).toBe('/lab/studio/projects/p1?preview=1&geo=node-2')
        expect(withGeoQuery('/lab/studio/projects/p1', '?preview=1&geo=node-1', null)).toBe('/lab/studio/projects/p1?preview=1')
        expect(withGeoQuery('/lab/studio/projects/p1', '?geo=node-1', null)).toBe('/lab/studio/projects/p1')
    })
})
