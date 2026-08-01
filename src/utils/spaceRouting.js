const APP_BASE_PATH = ((import.meta.env.BASE_URL) || '/').replace(/\/+$/, '') || '/'
export const APP_PAGE_EDITOR = 'editor'
export const APP_PAGE_PREFERENCES = 'preferences'
export const APP_PAGE_PREFERENCES_ROUTE = 'admin'
export const APP_PAGE_PREFERENCES_ALIASES = [
    APP_PAGE_PREFERENCES_ROUTE,
    APP_PAGE_PREFERENCES,
    'prefrenaces',
    'preferances'
]
export const APP_PAGE_WIKI = 'wiki'
export const RESERVED_APP_SEGMENTS = [
    ...APP_PAGE_PREFERENCES_ALIASES,
    APP_PAGE_WIKI,
    'beta',
    'raw',
    'seed',
    'open_jam',
    'studio'
]

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

export const buildPublicProjectPath = (spaceId, projectId) => {
    const prefix = getAppBasePrefix()
    return `${prefix}/${spaceId}/p/${projectId}`.replace(/\/{2,}/g, '/')
}

// Clean public link shape — /{spaceSlugOrId}/{projectSlugOrId}, resolved
// server-side via /api/resolve/... (docs/architecture/SPEC_space_urls_and_portability.md).
// buildPublicProjectPath (the /p/ form above) stays the guaranteed-stable
// fallback: use it whenever only raw ids are in hand, or a slug isn't set.
export const buildVanityProjectPath = (spaceSlugOrId, projectSlugOrId) => {
    const prefix = getAppBasePrefix()
    return `${prefix}/${spaceSlugOrId}/${projectSlugOrId}`.replace(/\/{2,}/g, '/')
}

export const buildPreferencesPath = (spaceId) => {
    const prefix = getAppBasePrefix()
    const basePath = `${prefix}/${APP_PAGE_PREFERENCES_ROUTE}`.replace(/\/{2,}/g, '/')
    if (!spaceId) return basePath
    const params = new URLSearchParams({ space: spaceId })
    return `${basePath}?${params.toString()}`
}

export const isReservedAppSegment = (value = '') => RESERVED_APP_SEGMENTS.includes((value || '').trim().toLowerCase())
export const isPreferencesPageSegment = (value = '') => APP_PAGE_PREFERENCES_ALIASES.includes((value || '').trim().toLowerCase())
export const isWikiPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_WIKI

export const buildWikiPath = () => {
    const prefix = getAppBasePrefix()
    return `${prefix}/${APP_PAGE_WIKI}`.replace(/\/{2,}/g, '/')
}

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
        if (isWikiPageSegment(segment)) {
            return {
                page: APP_PAGE_WIKI,
                spaceId: null
            }
        }
        if (segment) {
            const segments = relative.split('/')
            if (segments[1] === 'p' && segments[2]) {
                return {
                    page: APP_PAGE_EDITOR,
                    spaceId: segment,
                    projectId: segments[2]
                }
            }
            // Bare two-segment shape (/{spaceSlugOrId}/{projectSlugOrId}) — this
            // classifies the URL shape only; segments[1] here is unresolved and
            // untrusted (could be a real project slug, a typo, or nothing) until
            // the resolving component (SlugProjectRoute) confirms it against
            // /api/resolve/... and falls back to a plain space route on a 404,
            // never assuming/defaulting it means anything. Excludes 'p' (already
            // reserved by the /p/ shape above) and RESERVED_APP_SEGMENTS
            // ('studio'/'beta'/etc) — those are claimed earlier in RootApp's
            // dispatch order by their own location parsers regardless, but this
            // is a defense-in-depth guard so getAppLocationState is correct on
            // its own, not dependent on caller dispatch order.
            if (segments[1] && segments[1] !== 'p' && !isReservedAppSegment(segments[1])) {
                return {
                    page: APP_PAGE_EDITOR,
                    spaceId: segment,
                    projectSlugSegment: segments[1]
                }
            }
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
