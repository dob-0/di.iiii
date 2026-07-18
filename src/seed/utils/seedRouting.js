import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

export const SEED_PAGE_HUB = 'hub'
export const SEED_PAGE_PROJECT = 'project'
export const SEED_PAGE_PROJECTS = 'projects'
export const SEED_RESERVED_SEGMENT = 'seed'
export const DEFAULT_SEED_SPACE_ID = 'main'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildSeedHubPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, SEED_RESERVED_SEGMENT)
    }
    return joinPath(prefix, spaceId, SEED_RESERVED_SEGMENT)
}

export const buildSeedProjectsPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, SEED_RESERVED_SEGMENT, 'projects')
    }
    return joinPath(prefix, spaceId, SEED_RESERVED_SEGMENT, 'projects')
}

export const buildSeedProjectPath = (projectId, spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, SEED_RESERVED_SEGMENT, 'projects', projectId)
    }
    return joinPath(prefix, spaceId, SEED_RESERVED_SEGMENT, 'projects', projectId)
}

export const getSeedLocationState = (
    locationLike = null,
    { defaultSpaceId = DEFAULT_SEED_SPACE_ID } = {}
) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isSeed: false, page: null, projectId: null, spaceId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    if (segments[0] !== SEED_RESERVED_SEGMENT) {
        if (segments[1] !== SEED_RESERVED_SEGMENT || !segments[0]) {
            return { isSeed: false, page: null, projectId: null, spaceId: null }
        }

        if (segments[2] === 'projects' && segments[3]) {
            return {
                isSeed: true,
                page: SEED_PAGE_PROJECT,
                projectId: segments[3],
                spaceId: segments[0]
            }
        }

        if (segments[2] === 'projects') {
            return {
                isSeed: true,
                page: SEED_PAGE_PROJECTS,
                projectId: null,
                spaceId: segments[0]
            }
        }

        return {
            isSeed: true,
            page: SEED_PAGE_HUB,
            projectId: null,
            spaceId: segments[0]
        }
    }

    if (segments[1] === 'projects' && segments[2]) {
        return {
            isSeed: true,
            page: SEED_PAGE_PROJECT,
            projectId: segments[2],
            spaceId: defaultSpaceId
        }
    }

    if (segments[1] === 'projects') {
        return {
            isSeed: true,
            page: SEED_PAGE_PROJECTS,
            projectId: null,
            spaceId: defaultSpaceId
        }
    }

    return {
        isSeed: true,
        page: SEED_PAGE_HUB,
        projectId: null,
        spaceId: defaultSpaceId
    }
}

export const isSeedLocation = (locationState = null) => Boolean(locationState?.isSeed)

export { appNavigate as navigateToSeedPath } from '../../utils/appNavigate.js'
