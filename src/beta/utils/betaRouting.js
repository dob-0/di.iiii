const BETA_BASE_PATH = ((import.meta.env.BASE_URL) || '/').replace(/\/+$/, '') || '/'

export const BETA_PAGE_HUB = 'hub'
export const BETA_PAGE_PROJECT = 'project'
export const BETA_RESERVED_SEGMENT = 'beta'

const getBasePrefix = () => (BETA_BASE_PATH === '/' ? '' : BETA_BASE_PATH)

const stripBasePath = (pathname = '/') => {
    if (!pathname) return '/'
    if (BETA_BASE_PATH !== '/' && pathname.startsWith(BETA_BASE_PATH)) {
        const stripped = pathname.slice(BETA_BASE_PATH.length)
        return stripped || '/'
    }
    return pathname
}

export const buildBetaHubPath = () => {
    const prefix = getBasePrefix()
    return `${prefix}/${BETA_RESERVED_SEGMENT}`.replace(/\/{2,}/g, '/')
}

export const buildBetaProjectPath = (projectId) => {
    const prefix = getBasePrefix()
    return `${prefix}/${BETA_RESERVED_SEGMENT}/projects/${projectId}`.replace(/\/{2,}/g, '/')
}

export const getBetaLocationState = (locationLike = null) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { isBeta: false, page: null, projectId: null }
    }

    const relative = stripBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []

    if (segments[0] !== BETA_RESERVED_SEGMENT) {
        return { isBeta: false, page: null, projectId: null }
    }

    if (segments[1] === 'projects' && segments[2]) {
        return {
            isBeta: true,
            page: BETA_PAGE_PROJECT,
            projectId: segments[2]
        }
    }

    return {
        isBeta: true,
        page: BETA_PAGE_HUB,
        projectId: null
    }
}

export const isBetaLocation = (locationState = null) => Boolean(locationState?.isBeta)

export const navigateToBetaPath = (path, { replace = false } = {}) => {
    if (typeof window === 'undefined') return
    const method = replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
}
