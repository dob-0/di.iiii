const STUDIO_BASE_PATH = ((import.meta.env.BASE_URL) || '/').replace(/\/+$/, '') || '/'

export const STUDIO_PAGE_HUB = 'hub'
export const STUDIO_PAGE_PROJECT = 'project'
export const STUDIO_RESERVED_SEGMENT = 'studio'

const getBasePrefix = () => (STUDIO_BASE_PATH === '/' ? '' : STUDIO_BASE_PATH)

const stripBasePath = (pathname = '/') => {
    if (!pathname) return '/'
    if (STUDIO_BASE_PATH !== '/' && pathname.startsWith(STUDIO_BASE_PATH)) {
        const stripped = pathname.slice(STUDIO_BASE_PATH.length)
        return stripped || '/'
    }
    return pathname
}

export const buildStudioHubPath = () => {
    const prefix = getBasePrefix()
    return `${prefix}/${STUDIO_RESERVED_SEGMENT}`.replace(/\/{2,}/g, '/')
}

export const buildStudioProjectPath = (projectId) => {
    const prefix = getBasePrefix()
    return `${prefix}/${STUDIO_RESERVED_SEGMENT}/projects/${projectId}`.replace(/\/{2,}/g, '/')
}

export const getStudioLocationState = (locationLike = null) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isStudio: false, page: null, projectId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    if (segments[0] !== STUDIO_RESERVED_SEGMENT) {
        return { isStudio: false, page: null, projectId: null }
    }

    if (segments[1] === 'projects' && segments[2]) {
        return {
            isStudio: true,
            page: STUDIO_PAGE_PROJECT,
            projectId: segments[2]
        }
    }

    return {
        isStudio: true,
        page: STUDIO_PAGE_HUB,
        projectId: null
    }
}

export const isStudioLocation = (locationState = null) => Boolean(locationState?.isStudio)

export const navigateToStudioPath = (path, { replace = false } = {}) => {
    if (typeof window === 'undefined') return
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
}
