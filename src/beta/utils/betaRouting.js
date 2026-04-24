const BETA_BASE_PATH = ((import.meta.env.BASE_URL) || '/').replace(/\/+$/, '') || '/'

export const BETA_PAGE_HUB = 'hub'
export const BETA_PAGE_PROJECT = 'project'
export const BETA_PAGE_PROJECTS = 'projects'
export const BETA_RESERVED_SEGMENT = 'beta'
export const DEFAULT_BETA_SPACE_ID = 'main'

const getBasePrefix = () => (BETA_BASE_PATH === '/' ? '' : BETA_BASE_PATH)

const stripBasePath = (pathname = '/') => {
    if (!pathname) return '/'
    if (BETA_BASE_PATH !== '/' && pathname.startsWith(BETA_BASE_PATH)) {
        const stripped = pathname.slice(BETA_BASE_PATH.length)
        return stripped || '/'
    }
    return pathname
}

export const buildBetaHubPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return `${prefix}/${BETA_RESERVED_SEGMENT}`.replace(/\/{2,}/g, '/')
    }
    return `${prefix}/${spaceId}/${BETA_RESERVED_SEGMENT}`.replace(/\/{2,}/g, '/')
}

export const buildBetaProjectsPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return `${prefix}/${BETA_RESERVED_SEGMENT}/projects`.replace(/\/{2,}/g, '/')
    }
    return `${prefix}/${spaceId}/${BETA_RESERVED_SEGMENT}/projects`.replace(/\/{2,}/g, '/')
}

export const buildBetaProjectPath = (projectId, spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return `${prefix}/${BETA_RESERVED_SEGMENT}/projects/${projectId}`.replace(/\/{2,}/g, '/')
    }
    return `${prefix}/${spaceId}/${BETA_RESERVED_SEGMENT}/projects/${projectId}`.replace(/\/{2,}/g, '/')
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

export const navigateToBetaPath = (path, { replace = false } = {}) => {
    if (typeof window === 'undefined') return
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
}
