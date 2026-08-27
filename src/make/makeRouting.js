import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/make/{projectId} — the toybox.
//
// Raw is a workshop bench: eight window bars, a node graph, nine "Enter ›"
// affordances, and on a 390px phone the thing being made is not on the screen
// at all. Same drawers underneath, different lid — this address opens the same
// project document through the same op layer, so a mentor opening
// /{space}/raw/projects/{projectId} sees everything a child made here.
//
// One shape only, deliberately. There is no /{space}/make list and no default
// space: a child follows a link somebody handed them, and every address this
// surface can be reached at is one a mentor wrote down. A lane that guesses
// which project you meant is a lane that can open the wrong child's room.
export const MAKE_SEGMENT = 'make'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildMakePath = (spaceId, projectId) => {
    const prefix = getBasePrefix()
    return joinPath(prefix, spaceId, MAKE_SEGMENT, projectId)
}

export const getMakeLocationState = (locationLike = null) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isMake: false, projectId: null, spaceId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    if (segments.length !== 3) return { isMake: false, projectId: null, spaceId: null }
    if (segments[1] !== MAKE_SEGMENT) return { isMake: false, projectId: null, spaceId: null }
    if (!segments[0] || !segments[2]) return { isMake: false, projectId: null, spaceId: null }

    return { isMake: true, spaceId: segments[0], projectId: segments[2] }
}

export const isMakeLocation = (locationState = null) => Boolean(locationState?.isMake)
