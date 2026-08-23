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
export const APP_PAGE_PRIVACY = 'privacy'
export const APP_PAGE_TERMS = 'terms'
// A standalone poster page (src/garage/), not a space: it has no project
// document, no auth and nothing in the DB to look up, so it routes like
// /privacy rather than like /wcc.
export const APP_PAGE_GARAGE = 'garage'
export const RESERVED_APP_SEGMENTS = [
    ...APP_PAGE_PREFERENCES_ALIASES,
    APP_PAGE_WIKI,
    APP_PAGE_PRIVACY,
    APP_PAGE_TERMS,
    APP_PAGE_GARAGE,
    'beta',
    'raw',
    'seed',
    'open_jam',
    'studio',
    // The layered addresses (studioRouting.js): /spaces and /{space}/projects.
    // Reserved here so a project slug can never shadow the space's own project
    // list. Checked against production and staging before reserving — no space
    // and no project answered to either word on any tier.
    'spaces',
    'projects'
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

// The tool doorway: append one word to a project's link and it opens in that tool.
//
//   /wcc/alla-virabyan          the project, published
//   /wcc/alla-virabyan/studio   the same project, open in Studio
//   /wcc/alla-virabyan/raw      the same project, open in the node editor
//
// An ALIAS, never a canonical address. RootApp resolves the slug and then rewrites
// the bar to the lane's own path, so no new permanent URL is minted and nothing new
// has to be supported forever — the same contract the retired /seed segment gets.
// The closed list of two is safe by construction: both words are already unusable as
// a project slug (serverXR/src/projectStore.js PROJECT_RESERVED_SLUGS) and as a space
// id (serverXR/src/spaceStore.js RESERVED_SPACE_SLUGS), so a doorway can never be
// mistaken for content.
export const TOOL_SEGMENT_STUDIO = 'studio'
export const TOOL_SEGMENT_RAW = 'raw'
export const PROJECT_TOOL_SEGMENTS = [TOOL_SEGMENT_STUDIO, TOOL_SEGMENT_RAW]
export const isProjectToolSegment = (value = '') =>
    PROJECT_TOOL_SEGMENTS.includes((value || '').trim().toLowerCase())

export const buildProjectToolPath = (spaceSlugOrId, projectSlugOrId, toolSegment) =>
    `${buildVanityProjectPath(spaceSlugOrId, projectSlugOrId)}/${toolSegment}`

// Emits /{space}/admin. The old /admin?space={id} still PARSES — every link
// already in the wild keeps working — but nothing mints it any more: a space is
// the level that owns the thing being administered, so it belongs in the path,
// not in a parameter you could delete and still have a valid address.
export const buildPreferencesPath = (spaceId) => {
    const prefix = getAppBasePrefix()
    const basePath = `${prefix}/${APP_PAGE_PREFERENCES_ROUTE}`.replace(/\/{2,}/g, '/')
    if (!spaceId) return basePath
    return `${prefix}/${spaceId}/${APP_PAGE_PREFERENCES_ROUTE}`.replace(/\/{2,}/g, '/')
}

export const isReservedAppSegment = (value = '') => RESERVED_APP_SEGMENTS.includes((value || '').trim().toLowerCase())
export const isPreferencesPageSegment = (value = '') => APP_PAGE_PREFERENCES_ALIASES.includes((value || '').trim().toLowerCase())
export const isWikiPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_WIKI
export const isPrivacyPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_PRIVACY
export const isTermsPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_TERMS
export const isGaragePageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_GARAGE

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
        // /privacy and /terms are plain top-level routes for now; the URL
        // namespace spec (docs/architecture/SPEC_url_architecture_and_tree_addressing.md)
        // parks them at /-/privacy — migrate these when that spec is signed off.
        if (isPrivacyPageSegment(segment)) {
            return {
                page: APP_PAGE_PRIVACY,
                spaceId: null
            }
        }
        if (isTermsPageSegment(segment)) {
            return {
                page: APP_PAGE_TERMS,
                spaceId: null
            }
        }
        if (isGaragePageSegment(segment)) {
            return {
                page: APP_PAGE_GARAGE,
                spaceId: null
            }
        }
        if (segment) {
            const segments = relative.split('/')
            // A space's ops, with the space in the PATH. /admin?space=x kept the space
            // as a query parameter — the one level that owns everything else, demoted
            // to something you could drop and still have a valid URL. The old form
            // keeps parsing above, so no existing link rots.
            if (segments.length === 2 && isPreferencesPageSegment(segments[1])) {
                return {
                    page: APP_PAGE_PREFERENCES,
                    spaceId: segment
                }
            }
            if (segments[1] === 'p' && segments[2]) {
                // The doorway works on the /p/ form too, so "append the tool" is true
                // of EVERY project link and not only the pretty one. Here the id is
                // already real, so no resolve step is needed.
                const idTool = segments.length === 4 && isProjectToolSegment(segments[3])
                    ? segments[3].trim().toLowerCase()
                    : null
                return {
                    page: APP_PAGE_EDITOR,
                    spaceId: segment,
                    projectId: segments[2],
                    ...(idTool ? { toolSegment: idTool } : {})
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
                // A tool word in the LAST position is a doorway; anything else after
                // the project slug is a tail we do not recognise. Both were silently
                // dropped before, so /wcc/x/studio and /wcc/x/banana rendered the
                // published page and the URL bar lied about it.
                const tail = segments.slice(2)
                const toolSegment = tail.length === 1 && isProjectToolSegment(tail[0])
                    ? tail[0].trim().toLowerCase()
                    : null
                return {
                    page: APP_PAGE_EDITOR,
                    spaceId: segment,
                    projectSlugSegment: segments[1],
                    // Spread conditionally: the two-segment return must stay
                    // byte-identical, or a toEqual on the whole object fails for a
                    // URL whose behaviour did not change.
                    ...(toolSegment ? { toolSegment } : {}),
                    ...(tail.length && !toolSegment ? { hasUnknownTail: true } : {})
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
