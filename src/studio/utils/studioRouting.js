import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

export const STUDIO_PAGE_SPACES = 'spaces'
export const STUDIO_PAGE_HUB = 'hub'
export const STUDIO_PAGE_PROJECT = 'project'
export const STUDIO_RESERVED_SEGMENT = 'studio'
export const DEFAULT_STUDIO_SPACE_ID = 'main'

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
            spaceId: defaultSpaceId
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
