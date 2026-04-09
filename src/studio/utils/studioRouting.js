const STUDIO_BASE_PATH = ((import.meta.env.BASE_URL) || '/').replace(/\/+$/, '') || '/'

export const STUDIO_PAGE_HUB = 'hub'
export const STUDIO_PAGE_PROJECT = 'project'
export const STUDIO_RESERVED_SEGMENT = 'studio'
export const DEFAULT_STUDIO_SPACE_ID = 'main'

const getBasePrefix = () => (STUDIO_BASE_PATH === '/' ? '' : STUDIO_BASE_PATH)

const stripBasePath = (pathname = '/') => {
    if (!pathname) return '/'
    if (STUDIO_BASE_PATH !== '/' && pathname.startsWith(STUDIO_BASE_PATH)) {
        const stripped = pathname.slice(STUDIO_BASE_PATH.length)
        return stripped || '/'
    }
    return pathname
}

export const buildStudioHubPath = (spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return `${prefix}/${STUDIO_RESERVED_SEGMENT}`.replace(/\/{2,}/g, '/')
    }
    return `${prefix}/${spaceId}/${STUDIO_RESERVED_SEGMENT}`.replace(/\/{2,}/g, '/')
}

export const buildStudioProjectPath = (projectId, spaceId = null) => {
    const prefix = getBasePrefix()
    if (!spaceId) {
        return `${prefix}/${STUDIO_RESERVED_SEGMENT}/projects/${projectId}`.replace(/\/{2,}/g, '/')
    }
    return `${prefix}/${spaceId}/${STUDIO_RESERVED_SEGMENT}/projects/${projectId}`.replace(/\/{2,}/g, '/')
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

    return {
        isStudio: true,
        page: STUDIO_PAGE_HUB,
        projectId: null,
        spaceId: defaultSpaceId
    }
}

export const isStudioLocation = (locationState = null) => Boolean(locationState?.isStudio)

export const navigateToStudioPath = (path, { replace = false } = {}) => {
    if (typeof window === 'undefined') return
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
}
