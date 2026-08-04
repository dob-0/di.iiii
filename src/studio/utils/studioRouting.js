import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

export const STUDIO_PAGE_SPACES = 'spaces'
export const STUDIO_PAGE_HUB = 'hub'
export const STUDIO_PAGE_PROJECT = 'project'

// The authoring surface for a CODE space. Studio's editor opens a project
// document, and a code space has none — its scene is React, and the thing that
// authors it is the piece's own panel. So `/<space>/studio/director` is a
// Studio page that mounts that panel instead of the document editor.
//
// Under `/studio` deliberately, not beside the piece: it inherits the same
// ProtectedSurface gate every other Studio route has, which is the correct one
// for an authoring tool. The piece's own `?director` route stays as it is, for
// judging timing on the headset the work actually runs on.
export const STUDIO_PAGE_DIRECTOR = 'director'
export const STUDIO_RESERVED_SEGMENT = 'studio'
export const DEFAULT_STUDIO_SPACE_ID = 'main'

// Friendly short entry for the communal jam. `/open_jam` is a QR-/flyer-sized
// alias for the full `/open/studio/projects/open-jam` path; it resolves to the
// same editor state without a redirect, so the short URL stays in the bar.
// Kept in sync with the server's OPEN_SPACE_ID ('open') + OPEN_JAM_PROJECT_ID.
export const OPEN_JAM_ALIAS_SEGMENT = 'open_jam'
export const OPEN_JAM_SPACE_ID = 'open'
export const OPEN_JAM_PROJECT_ID = 'open-jam'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildStudioSpacesPath = () => {
    const prefix = getBasePrefix()
    return joinPath(prefix, STUDIO_RESERVED_SEGMENT)
}

export const buildStudioHubPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        // spaceId is falsy in this branch, so `spaceId || DEFAULT_STUDIO_SPACE_ID`
        // always resolves to DEFAULT_STUDIO_SPACE_ID — preserved as-is from the
        // pre-extraction code rather than "fixed" here (out of scope for this pass).
        return joinPath(prefix, spaceId || DEFAULT_STUDIO_SPACE_ID, STUDIO_RESERVED_SEGMENT)
    }
    return joinPath(prefix, spaceId, STUDIO_RESERVED_SEGMENT)
}

export const buildStudioDirectorPath = (spaceId) =>
    joinPath(getBasePrefix(), spaceId, STUDIO_RESERVED_SEGMENT, STUDIO_PAGE_DIRECTOR)

export const buildStudioProjectPath = (projectId, spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, STUDIO_RESERVED_SEGMENT, 'projects', projectId)
    }
    return joinPath(prefix, spaceId, STUDIO_RESERVED_SEGMENT, 'projects', projectId)
}

export const getStudioLocationState = (
    locationLike = null,
    { defaultSpaceId = DEFAULT_STUDIO_SPACE_ID } = {}
) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isStudio: false, page: null, projectId: null, spaceId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    // Short public alias: `/open_jam` -> the communal open-jam project editor.
    if (segments.length === 1 && segments[0] === OPEN_JAM_ALIAS_SEGMENT) {
        return {
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: OPEN_JAM_PROJECT_ID,
            spaceId: OPEN_JAM_SPACE_ID
        }
    }

    if (segments[0] !== STUDIO_RESERVED_SEGMENT) {
        if (segments[1] !== STUDIO_RESERVED_SEGMENT || !segments[0]) {
            return { isStudio: false, page: null, projectId: null, spaceId: null }
        }

        if (segments[2] === 'projects' && segments[3]) {
            return {
                isStudio: true,
                page: STUDIO_PAGE_PROJECT,
                projectId: segments[3],
                spaceId: segments[0]
            }
        }

        if (segments[2] === STUDIO_PAGE_DIRECTOR && !segments[3]) {
            return {
                isStudio: true,
                page: STUDIO_PAGE_DIRECTOR,
                projectId: null,
                spaceId: segments[0]
            }
        }

        return {
            isStudio: true,
            page: STUDIO_PAGE_HUB,
            projectId: null,
            spaceId: segments[0]
        }
    }

    if (segments[1] === 'projects' && segments[2]) {
        return {
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: segments[2],
            // No space segment in the URL — leave spaceId unset so StudioEditor
            // falls back to the project's own document.projectMeta.spaceId
            // instead of being forced onto 'main' (was the wrong-space bug).
            spaceId: null
        }
    }

    if (segments.length === 1) {
        return {
            isStudio: true,
            page: STUDIO_PAGE_SPACES,
            projectId: null,
            spaceId: null
        }
    }

    return {
        isStudio: true,
        page: STUDIO_PAGE_HUB,
        projectId: null,
        spaceId: defaultSpaceId
    }
}

export const isStudioLocation = (locationState = null) => Boolean(locationState?.isStudio)

export { appNavigate as navigateToStudioPath } from '../../utils/appNavigate.js'
