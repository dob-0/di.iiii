import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/build/{projectId} — view A, the room in first person: walk it, and build
// the rig in it by hand (docs/architecture/RIG_BUILD.md §12). Behind the same gate as
// the plot and the cards, because it writes the same document.
//
// /{space}/crew/{projectId} — the same room for the light engineers: read only, the
// address tags on, the patch sheet one tap away. No gate of its own, like the patch
// sheet: the server decides who may read the document, so the link handed to a crew
// opens like any public page.
//
// The same three-segment shape as /{space}/plot/{id} and /{space}/cards/{id}, claimed
// the same way, before the generic /{space}/{projectSlug} rule would read the word as
// a project.
export const BUILD_SEGMENT = 'build'
export const CREW_SEGMENT = 'crew'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildBuildPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, BUILD_SEGMENT, projectId)
export const buildCrewPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, CREW_SEGMENT, projectId)

const EMPTY = { isBuild: false, crew: false, spaceId: null, projectId: null }

export const getBuildLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || !segments[0] || !segments[2]) return EMPTY
    if (segments[1] !== BUILD_SEGMENT && segments[1] !== CREW_SEGMENT) return EMPTY
    return { isBuild: true, crew: segments[1] === CREW_SEGMENT, spaceId: segments[0], projectId: segments[2] }
}

export const isBuildLocation = (state = null) => Boolean(state?.isBuild)
