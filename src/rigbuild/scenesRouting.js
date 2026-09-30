import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/scenes/{projectId} — the SCENE DECK: A (scene tiles and the four controls) and
// B (the loop as a timeline) over one scene list (docs/architecture/RIG_BUILD.md §22). Same
// shape as /{space}/cards/{id}: exactly three segments with the word in the middle,
// claimed before the generic /{space}/{projectSlug} rule would read it as a project.
export const SCENES_SEGMENT = 'scenes'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildScenesPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, SCENES_SEGMENT, projectId)

const EMPTY = { isScenes: false, spaceId: null, projectId: null }

export const getScenesLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== SCENES_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isScenes: true, spaceId: segments[0], projectId: segments[2] }
}

export const isScenesLocation = (state = null) => Boolean(state?.isScenes)
