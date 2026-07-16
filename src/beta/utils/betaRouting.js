import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

export const BETA_PAGE_HUB = 'hub'
export const BETA_PAGE_PROJECT = 'project'
export const BETA_PAGE_PROJECTS = 'projects'
export const BETA_RESERVED_SEGMENT = 'beta'
export const DEFAULT_BETA_SPACE_ID = 'main'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildBetaHubPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, BETA_RESERVED_SEGMENT)
    }
    return joinPath(prefix, spaceId, BETA_RESERVED_SEGMENT)
}

export const buildBetaProjectsPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, BETA_RESERVED_SEGMENT, 'projects')
    }
    return joinPath(prefix, spaceId, BETA_RESERVED_SEGMENT, 'projects')
}

export const buildBetaProjectPath = (projectId, spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, BETA_RESERVED_SEGMENT, 'projects', projectId)
    }
    return joinPath(prefix, spaceId, BETA_RESERVED_SEGMENT, 'projects', projectId)
}

export const getBetaLocationState = (
    locationLike = null,
    { defaultSpaceId = DEFAULT_BETA_SPACE_ID } = {}
) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isBeta: false, page: null, projectId: null, spaceId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    if (segments[0] !== BETA_RESERVED_SEGMENT) {
        if (segments[1] !== BETA_RESERVED_SEGMENT || !segments[0]) {
            return { isBeta: false, page: null, projectId: null, spaceId: null }
        }

        if (segments[2] === 'projects' && segments[3]) {
            return {
                isBeta: true,
                page: BETA_PAGE_PROJECT,
                projectId: segments[3],
                spaceId: segments[0]
            }
        }

        if (segments[2] === 'projects') {
            return {
                isBeta: true,
                page: BETA_PAGE_PROJECTS,
                projectId: null,
                spaceId: segments[0]
            }
        }

        return {
            isBeta: true,
            page: BETA_PAGE_HUB,
            projectId: null,
            spaceId: segments[0]
        }
    }

    if (segments[1] === 'projects' && segments[2]) {
        return {
            isBeta: true,
            page: BETA_PAGE_PROJECT,
            projectId: segments[2],
            spaceId: defaultSpaceId
        }
    }

    if (segments[1] === 'projects') {
        return {
            isBeta: true,
            page: BETA_PAGE_PROJECTS,
            projectId: null,
            spaceId: defaultSpaceId
        }
    }

    return {
        isBeta: true,
        page: BETA_PAGE_HUB,
        projectId: null,
        spaceId: defaultSpaceId
    }
}

export const isBetaLocation = (locationState = null) => Boolean(locationState?.isBeta)

export { appNavigate as navigateToBetaPath } from '../../utils/appNavigate.js'
