const APP_BASE_PATH = ((import.meta.env.BASE_URL) || '/').replace(/\/+$/, '') || '/'
export const APP_PAGE_EDITOR = 'editor'
export const APP_PAGE_PREFERENCES = 'preferences'
export const APP_PAGE_PREFERENCES_ALIASES = [
    APP_PAGE_PREFERENCES,
    'prefrenaces',
    'preferances',
    'admin'
]
export const RESERVED_APP_SEGMENTS = [...APP_PAGE_PREFERENCES_ALIASES]

const getAppBasePrefix = () => (APP_BASE_PATH === '/' ? '' : APP_BASE_PATH)

export const stripAppBasePath = (pathname = '/') => {
    if (!pathname) return '/'
    if (APP_BASE_PATH !== '/' && pathname.startsWith(APP_BASE_PATH)) {
        const stripped = pathname.slice(APP_BASE_PATH.length)
        return stripped || '/'
    }
    return pathname
}

export const buildAppSpacePath = (spaceId) => {
    const prefix = getAppBasePrefix()
    if (!spaceId) {
        return prefix ? `${prefix}/` : '/'
    }
    return `${prefix}/${spaceId}`.replace(/\/{2,}/g, '/')
}

export const buildPreferencesPath = (spaceId) => {
    const prefix = getAppBasePrefix()
    const basePath = `${prefix}/${APP_PAGE_PREFERENCES}`.replace(/\/{2,}/g, '/')
    if (!spaceId) return basePath
    const params = new URLSearchParams({ space: spaceId })
    return `${basePath}?${params.toString()}`
}

export const isReservedAppSegment = (value = '') => RESERVED_APP_SEGMENTS.includes((value || '').trim().toLowerCase())
export const isPreferencesPageSegment = (value = '') => APP_PAGE_PREFERENCES_ALIASES.includes((value || '').trim().toLowerCase())

export const getAppLocationState = (locationLike = null) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) {
        return { page: APP_PAGE_EDITOR, spaceId: null }
    }

    let relative = stripAppBasePath(resolvedLocation.pathname || '/')
    relative = relative.replace(/^\/+/g, '').replace(/\/+$/g, '')
    const params = new URLSearchParams(resolvedLocation.search || '')

    if (relative) {
        const [segment] = relative.split('/')
        if (isPreferencesPageSegment(segment)) {
            return {
                page: APP_PAGE_PREFERENCES,
                spaceId: params.get('space')
            }
        }
        if (segment) {
            return {
                page: APP_PAGE_EDITOR,
                spaceId: segment
            }
        }
    }

    return {
        page: APP_PAGE_EDITOR,
        spaceId: params.get('space')
    }
}

export const getInitialSpaceIdFromLocation = () => getAppLocationState().spaceId
