import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/map/{projectId}      — the mapper's desk
// /{space}/map/{projectId}/out  — the signal
//
// Two lids on one document, the way Raw and Make are. The desk is where the
// corners get dragged; `out` is a black page with nothing on it but the
// surfaces, which is what you drag onto the projector and put full-screen.
//
// They are separate ADDRESSES rather than a full-screen toggle because a
// mapping session is inherently two screens: the operator is looking at the
// laptop while the wall shows the result. A toggle would mean the operator
// cannot see the controls at the moment they matter.
export const MAP_SEGMENT = 'map'
export const MAP_OUTPUT_SEGMENT = 'out'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildMapPath = (spaceId, projectId) =>
    joinPath(getBasePrefix(), spaceId, MAP_SEGMENT, projectId)

export const buildMapOutputPath = (spaceId, projectId) =>
    joinPath(getBasePrefix(), spaceId, MAP_SEGMENT, projectId, MAP_OUTPUT_SEGMENT)

const EMPTY = { isMap: false, isOutput: false, projectId: null, spaceId: null }

export const getMapLocationState = (locationLike = null) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) return EMPTY

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    if (segments.length !== 3 && segments.length !== 4) return EMPTY
    if (segments[1] !== MAP_SEGMENT) return EMPTY
    if (!segments[0] || !segments[2]) return EMPTY
    // A fourth segment is only ever `out`. Anything else is not this lane —
    // returning "map, but ignore the tail" would quietly open the desk at an
    // address somebody meant as something else.
    if (segments.length === 4 && segments[3] !== MAP_OUTPUT_SEGMENT) return EMPTY

    return {
        isMap: true,
        isOutput: segments.length === 4,
        spaceId: segments[0],
        projectId: segments[2]
    }
}

export const isMapLocation = (locationState = null) => Boolean(locationState?.isMap)
