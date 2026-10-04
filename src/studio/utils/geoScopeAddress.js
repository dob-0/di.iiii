import { buildStudioProjectPath } from './studioRouting.js'

// The address of Studio standing inside a Geo: the project's own Studio
// address, unchanged, plus `?geo=<nodeId>`. A query, not a new path segment,
// so every existing address keeps meaning exactly what it meant — the project
// path still opens the whole room, and the router (getStudioLocationState)
// reads the path alone and never sees this.
export const GEO_QUERY_PARAM = 'geo'

// Node ids are generated (`node-…`); anything else in the bar is ignored
// rather than trusted, so a hand-typed address can never name something odd.
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/

export const readGeoIdFromSearch = (search = '') => {
    try {
        const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
        const value = (params.get(GEO_QUERY_PARAM) || '').trim()
        return SAFE_ID.test(value) ? value : null
    } catch {
        return null
    }
}

export const buildStudioGeoPath = (projectId, spaceId = null, geoId = null) => {
    const base = buildStudioProjectPath(projectId, spaceId)
    return geoId ? `${base}?${GEO_QUERY_PARAM}=${encodeURIComponent(geoId)}` : base
}

// The address bar's own path and query with the Geo set (or cleared), every
// other query parameter kept — switching Geo must not drop ?preview or any
// other flag the page was opened with.
export const withGeoQuery = (pathname = '/', search = '', geoId = null) => {
    let params
    try {
        params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
    } catch {
        params = new URLSearchParams()
    }
    if (geoId) params.set(GEO_QUERY_PARAM, geoId)
    else params.delete(GEO_QUERY_PARAM)
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
}
