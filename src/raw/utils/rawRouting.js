import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

export const RAW_PAGE_HUB = 'hub'
export const RAW_PAGE_PROJECT = 'project'
export const RAW_PAGE_PROJECTS = 'projects'
export const RAW_RESERVED_SEGMENT = 'raw'
// The lane was called Seed until 2026-07-30. Old links stay alive: a /seed path
// still resolves, and RootApp rewrites it to the /raw equivalent so the address
// bar heals itself instead of leaving the old name circulating forever.
export const LEGACY_RAW_SEGMENT = 'seed'
export const DEFAULT_RAW_SPACE_ID = 'main'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildRawHubPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, RAW_RESERVED_SEGMENT)
    }
    return joinPath(prefix, spaceId, RAW_RESERVED_SEGMENT)
}

export const buildRawProjectsPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, RAW_RESERVED_SEGMENT, 'projects')
    }
    return joinPath(prefix, spaceId, RAW_RESERVED_SEGMENT, 'projects')
}

export const buildRawProjectPath = (projectId, spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return joinPath(prefix, RAW_RESERVED_SEGMENT, 'projects', projectId)
    }
    return joinPath(prefix, spaceId, RAW_RESERVED_SEGMENT, 'projects', projectId)
}

export const getRawLocationState = (
    locationLike = null,
    { defaultSpaceId = DEFAULT_RAW_SPACE_ID } = {}
) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isRaw: false, page: null, projectId: null, spaceId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    const isLaneSegment = (segment) => segment === RAW_RESERVED_SEGMENT || segment === LEGACY_RAW_SEGMENT
    const isLegacyPath = segments[0] === LEGACY_RAW_SEGMENT || segments[1] === LEGACY_RAW_SEGMENT

    if (!isLaneSegment(segments[0])) {
        if (!isLaneSegment(segments[1]) || !segments[0]) {
            return { isRaw: false, page: null, projectId: null, spaceId: null }
        }

        if (segments[2] === 'projects' && segments[3]) {
            return {
                isRaw: true,
                isLegacyPath,
                page: RAW_PAGE_PROJECT,
                projectId: segments[3],
                spaceId: segments[0]
            }
        }

        if (segments[2] === 'projects') {
            return {
                isRaw: true,
                isLegacyPath,
                page: RAW_PAGE_PROJECTS,
                projectId: null,
                spaceId: segments[0]
            }
        }

        return {
            isRaw: true,
            isLegacyPath,
            page: RAW_PAGE_HUB,
            projectId: null,
            spaceId: segments[0]
        }
    }

    if (segments[1] === 'projects' && segments[2]) {
        return {
            isRaw: true,
            isLegacyPath,
            page: RAW_PAGE_PROJECT,
            projectId: segments[2],
            spaceId: defaultSpaceId,
            isDefaultSpace: true
        }
    }

    if (segments[1] === 'projects') {
        return {
            isRaw: true,
            isLegacyPath,
            page: RAW_PAGE_PROJECTS,
            projectId: null,
            spaceId: defaultSpaceId,
            isDefaultSpace: true
        }
    }

    return {
        isRaw: true,
        isLegacyPath,
        page: RAW_PAGE_HUB,
        projectId: null,
        spaceId: defaultSpaceId,
        isDefaultSpace: true
    }
}

export const isRawLocation = (locationState = null) => Boolean(locationState?.isRaw)

export { appNavigate as navigateToRawPath } from '../../utils/appNavigate.js'
