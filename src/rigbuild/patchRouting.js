import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/patch/{projectId} — the rig's patch sheet and power sheet, what a crew
// plugs by (docs/architecture/RIG_BUILD.md §3). Same shape as /{space}/perform/{id}:
// exactly three segments with the word in the middle, claimed before the generic
// /{space}/{projectSlug} rule would read "patch" as the name of a project.
export const PATCH_SEGMENT = 'patch'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildPatchSheetPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, PATCH_SEGMENT, projectId)

const EMPTY = { isPatchSheet: false, spaceId: null, projectId: null }

export const getPatchSheetLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== PATCH_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isPatchSheet: true, spaceId: segments[0], projectId: segments[2] }
}

export const isPatchSheetLocation = (state = null) => Boolean(state?.isPatchSheet)
