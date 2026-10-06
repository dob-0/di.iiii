import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/visualise/{projectId} — the VISUALISER: the light desk and the room side by
// side, the room drawn from the desk's DMX (docs/architecture/RIG_BUILD.md §18). Same
// shape as /{space}/patch/{id}: exactly three segments with the word in the middle,
// claimed before the generic /{space}/{projectSlug} rule would read it as a project.
export const VISUALISE_SEGMENT = 'visualise'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildVisualisePath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, VISUALISE_SEGMENT, projectId)

const EMPTY = { isVisualise: false, spaceId: null, projectId: null }

export const getVisualiseLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== VISUALISE_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isVisualise: true, spaceId: segments[0], projectId: segments[2] }
}

export const isVisualiseLocation = (state = null) => Boolean(state?.isVisualise)
