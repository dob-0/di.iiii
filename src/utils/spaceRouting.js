import { getHostSpace } from './hostSpace.js'

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
// `/{space}/projects` — everything a space holds, for whoever is allowed to
// look (src/pages/SpaceContentsPage.jsx). Not a new word: the segment was
// already reserved, and the layered address added on 2026-08-21 already meant
// "the space's projects, not whichever tool you happen to be holding". Until
// 2026-09-10 it rendered Studio's own hub behind Studio's own gate, so the one
// address that named the space's contents answered a visitor with a login
// wall. The author's hub keeps its own address, `/{space}/studio`.
export const APP_PAGE_SPACE_CONTENTS = 'space-contents'
export const SPACE_CONTENTS_SEGMENT = 'projects'
// `/{space}/scan` — the phone collecting a place (src/scan/ScanSurface.jsx).
// A space IS a place, and this is the address where the place walks in: the
// camera, the walk, the stills, and the wall they land on.
export const APP_PAGE_SCAN = 'scan'
export const SCAN_SEGMENT = 'scan'
export const APP_PAGE_PRIVACY = 'privacy'
export const APP_PAGE_TERMS = 'terms'
// The workshop — /tools (src/tools/ToolsRoom.jsx). The one address that leads to
// every other tool, so it must not be takeable by a space.
export const APP_PAGE_TOOLS = 'tools'
// The door sign for programs — /for-apps (src/pages/ForAppsPage.jsx): how an
// app, a script or an AI should identify itself, and the limits it meets. The
// server's 429 and 403 answers point here, so no space may take the word.
export const APP_PAGE_FOR_APPS = 'for-apps'
// The browser half of `di login` — /device (src/pages/DeviceLoginPage.jsx): a
// terminal shows a code, the person types it here and approves it. Reserved so no
// space or project can take the word. Checked before reserving, 2026-10-07:
// /serverXR/api/spaces/device and /serverXR/api/projects/device answer 404 on prod
// (diiii.xyz) and on the dev tier (the local install was not running to ask).
export const APP_PAGE_DEVICE = 'device'
export const RESERVED_APP_SEGMENTS = [
    ...APP_PAGE_PREFERENCES_ALIASES,
    APP_PAGE_WIKI,
    APP_PAGE_PRIVACY,
    APP_PAGE_TERMS,
    APP_PAGE_TOOLS,
    // Checked before reserving: /serverXR/api/spaces/for-apps 404s on prod and
    // on staging (2026-09-13), so nothing holds the word.
    APP_PAGE_FOR_APPS,
    APP_PAGE_DEVICE,
    'beta',
    'raw',
    'seed',
    'open_jam',
    'studio',
    // The toybox — /{space}/make/{projectId}, src/make/makeRouting.js. Reserved
    // for the same reason 'raw' and 'studio' are: without it, /{space}/make/{id}
    // parses as a project slug with an unrecognised tail and heals to the
    // published page, so the address a child was handed would silently open
    // something else. Checked before reserving — no project and no space
    // answers to the word on any tier.
    'make',
    // The lighting desk — /light, served by serverXR itself on a local di.iiii
    // (serverXR/src/routes/lightingRoutes.js). Reserved so no space can take
    // the word and shadow the desk on an install.
    'light',
    // The layered addresses (studioRouting.js): /spaces and /{space}/projects.
    // Reserved here so a project slug can never shadow the space's own project
    // list. Checked against production and the dev tier before reserving — no space
    // and no project answered to either word on any tier.
    'spaces',
    'projects',
    // The studio's chat room — /chat, and /{space}/chat for any other space.
    // Reserved so no space or project slug can shadow the address a team
    // installs to its phones. Checked before reserving: /serverXR/api/spaces/chat
    // answers 404 on prod and on the dev tier, and a PRIVATE space would answer 401,
    // so nothing holds the word on either tier.
    'chat',
    // `/{space}/scan` — the phone collecting a place (src/scan/ScanSurface.jsx).
    // Reserved for the same reason 'make' and 'map' are: without it the address
    // parses as /{space}/{projectSlug} with "scan" read as the name of a
    // project, and the page a phone was handed would heal to the published one.
    // Checked before reserving, 2026-09-22: /serverXR/api/spaces/scan and
    // /serverXR/api/projects/scan both answer 404 on prod (diiii.xyz), on the
    // dev tier and on the local install — nothing holds the word anywhere.
    SCAN_SEGMENT,
    // `/{space}/perform/{projectId}` — the Perform line (src/perform/). Reserved
    // for the same reason 'make' and 'scan' are. Checked before reserving,
    // 2026-09-24: /serverXR/api/spaces/perform and /serverXR/api/projects/perform
    // answer 404 on prod (diiii.xyz), on the dev tier and on the local install.
    'perform',
    // `/{space}/patch/{projectId}` — the rig's patch sheet and power sheet
    // (src/rigbuild/PatchSheetSurface.jsx, docs/architecture/RIG_BUILD.md §3).
    // Checked before reserving, 2026-09-28: /serverXR/api/spaces/patch and
    // /serverXR/api/projects/patch answer 404 on prod (diiii.xyz), on the dev
    // tier and on the local install.
    'patch',
    // `/{space}/plot/{projectId}` — the lighting plot, view B (src/rigbuild/PlotSurface.jsx,
    // docs/architecture/RIG_BUILD.md §10). Checked before reserving, 2026-09-28:
    // /serverXR/api/spaces/plot and /serverXR/api/projects/plot answer 404 on prod
    // (diiii.xyz), on the dev tier and on the local install.
    'plot',
    // `/{space}/cards/{projectId}` — the cards, view C (src/rigbuild/CardsSurface.jsx,
    // docs/architecture/RIG_BUILD.md §11). Checked before reserving, 2026-09-28:
    // /serverXR/api/spaces/cards and /serverXR/api/projects/cards answer 404 on prod
    // (diiii.xyz), on the dev tier and on the local install.
    'cards',
    // `/{space}/build/{projectId}` — view A, the rig built in the room in first
    // person, and `/{space}/crew/{projectId}` — the same room read-only for the
    // light engineers (src/rigbuild/BuildSurface.jsx, docs/architecture/RIG_BUILD.md
    // §12). Checked before reserving, 2026-09-28: /serverXR/api/spaces/{build,crew}
    // and /serverXR/api/projects/{build,crew} answer 404 on prod (diiii.xyz), on the
    // dev tier and on the local install.
    'build',
    'crew',
    // `/{space}/equipment/{projectId}` — the show's equipment list, the inventory and the
    // order (src/rigbuild/EquipmentSurface.jsx, docs/architecture/RIG_BUILD.md §13).
    // Checked before reserving, 2026-09-28: /serverXR/api/spaces/equipment and
    // /serverXR/api/projects/equipment answer 404 on prod (diiii.xyz), on the dev tier
    // and on the local install.
    'equipment',
    // The sign-in page — /login (SignInSurface in AuthGate.jsx). It was not a
    // route at all: the address a teammate is sent to fell through to the space
    // lookup and answered "Nothing lives at “login”" above a working form.
    // Checked before reserving: /serverXR/api/spaces/login 404s on prod,
    // staging and diiii.xyz.
    'login'
]

// /login, and only /login: a single segment, so a space called something else
// can still have a page under it without being read as the sign-in page.
export const SIGN_IN_SEGMENT = 'login'

export const isSignInPath = (locationLike = null) => {
    const pathname = stripAppBasePath(locationLike?.pathname || '/')
    const segments = pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean)
    return segments.length === 1 && segments[0] === SIGN_IN_SEGMENT
}

const getAppBasePrefix = () => (APP_BASE_PATH === '/' ? '' : APP_BASE_PATH)

export const stripAppBasePath = (pathname = '/') => {
    if (!pathname) return '/'
    if (APP_BASE_PATH !== '/' && pathname.startsWith(APP_BASE_PATH)) {
        const stripped = pathname.slice(APP_BASE_PATH.length)
        return stripped || '/'
    }
    return pathname
}

// ── A space on its own domain (docs/architecture/SPEC_space_own_domain.md) ──
// On yokozo.xyz the host IS the space, so the space segment is implied:
// `/instruments` there is `/taronx/instruments` here. Reading adds the segment
// back (getAppLocationState); building leaves it out (hostRelative), so a link
// made on the domain stays on the domain. A path that already names the space
// is read as it is, so a link built the long way still works.
const isHostSpaceSegment = (segment = '') => {
    const space = getHostSpace()
    if (!space) return false
    const word = String(segment || '').trim().toLowerCase()
    return word === space.id || (Boolean(space.slug) && word === space.slug)
}

const withHostSpace = (relative = '') => {
    const space = getHostSpace()
    if (!space) return relative
    const [first] = relative.split('/')
    if (!relative) return space.id
    return isHostSpaceSegment(first) ? relative : `${space.id}/${relative}`
}

// `${prefix}/taronx/x` -> `${prefix}/x` on taronx's own domain; anything else as it was.
const hostRelative = (path) => {
    const space = getHostSpace()
    if (!space) return path
    const prefix = getAppBasePrefix()
    const rest = path.slice(prefix.length).replace(/^\/+/, '')
    const [first, ...tail] = rest.split('/')
    if (!isHostSpaceSegment(first)) return path
    return `${prefix}/${tail.join('/')}`.replace(/\/{2,}/g, '/')
}

// Editing never happens on a space's own domain: the session cookie belongs to
// the platform's host, and sign-in returns only there. A path that is an editor
// or a platform page is answered by sending it to the same place on the
// platform. Returns that absolute address, or null when the domain serves it.
export const getPlatformRedirect = (locationLike = null) => {
    const space = getHostSpace()
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!space?.platformOrigin || !resolvedLocation) return null
    let segments = stripAppBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '').replace(/\/+$/g, '').split('/').filter(Boolean)
    if (segments.length && isHostSpaceSegment(segments[0])) segments = segments.slice(1)
    if (!segments.length) return null
    const origin = space.platformOrigin.replace(/\/+$/, '')
    const search = resolvedLocation.search || ''
    const spacePath = (rest) => `${origin}/${space.slug || space.id}/${rest.join('/')}${search}`
    const first = segments[0].toLowerCase()
    // The space's own list of projects is a visitor's page: served here.
    if (first === SPACE_CONTENTS_SEGMENT) return null
    if (isPreferencesPageSegment(first) || first === SCAN_SEGMENT) return spacePath(segments)
    if (isReservedAppSegment(first)) return `${origin}/${segments.join('/')}${search}`
    if (segments.length >= 2 && isProjectToolSegment(segments[segments.length - 1])) return spacePath(segments)
    return null
}

// The address to hand to someone else. When the space has a LIVE own domain
// (`domain`, from the space's metadata) it is that domain with the space
// segment dropped — https://yokozo.xyz/taronx-instruments, not
// https://diiii.xyz/taronx/taronx-instruments. Otherwise it is the platform
// origin plus `path`, as before. `path` is the ordinary path from
// buildAppSpacePath / buildPublicProjectPath / buildVanityProjectPath. Only for
// public viewer links: editor and admin links stay on the platform's origin.
export const buildShareUrl = ({ spaceId = '', spaceSlug = '', domain = '', path = '/' } = {}) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const host = String(domain || '').trim().toLowerCase()
    // Already on that domain: the path is domain-relative (hostRelative), keep it.
    if (!host || (typeof window !== 'undefined' && window.location.hostname.toLowerCase() === host)) {
        return `${origin}${path}`
    }
    const prefix = getAppBasePrefix()
    const rest = String(path).slice(String(path).startsWith(prefix) ? prefix.length : 0).replace(/^\/+/, '')
    const [first, ...tail] = rest.split('/')
    const names = [spaceId, spaceSlug].filter(Boolean).map((name) => String(name).toLowerCase())
    const inDomain = names.includes(String(first || '').toLowerCase()) ? tail.join('/') : rest
    return `https://${host}${prefix}/${inDomain}`.replace(/(?<!:)\/{2,}/g, '/')
}

export const buildAppSpacePath = (spaceId) => {
    const prefix = getAppBasePrefix()
    if (!spaceId) {
        return prefix ? `${prefix}/` : '/'
    }
    return hostRelative(`${prefix}/${spaceId}`.replace(/\/{2,}/g, '/'))
}

export const buildPublicProjectPath = (spaceId, projectId) => {
    const prefix = getAppBasePrefix()
    return hostRelative(`${prefix}/${spaceId}/p/${projectId}`.replace(/\/{2,}/g, '/'))
}

// Clean public link shape — /{spaceSlugOrId}/{projectSlugOrId}, resolved
// server-side via /api/resolve/... (docs/architecture/SPEC_space_urls_and_portability.md).
// buildPublicProjectPath (the /p/ form above) stays the guaranteed-stable
// fallback: use it whenever only raw ids are in hand, or a slug isn't set.
export const buildVanityProjectPath = (spaceSlugOrId, projectSlugOrId) => {
    const prefix = getAppBasePrefix()
    return hostRelative(`${prefix}/${spaceSlugOrId}/${projectSlugOrId}`.replace(/\/{2,}/g, '/'))
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

// A bare `/{reserved-word}` that no lane claimed — `/make`, `/light`,
// `/projects`. The word is reserved precisely so no space can ever be named
// it, which makes `GET /api/spaces/make` a question with a guaranteed answer:
// 404. Asking anyway produced the generic not-found card — "there is no space
// with that address, check the spelling" — which is wrong advice twice over
// (the spelling was right; the thing exists, at a longer address) and, on a
// hosted tier, was the only thing a visitor asking for the lighting desk ever
// saw. Call this LAST in RootApp's dispatch, after every lane router has had
// its chance: `/raw`, `/studio` and `/spaces` are bare reserved words too, and
// they answer for themselves.
export const getBareReservedSegment = (locationLike = null) => {
    const resolvedLocation = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolvedLocation) return null
    const relative = stripAppBasePath(resolvedLocation.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    if (!relative || relative.includes('/')) return null
    const word = relative.trim().toLowerCase()
    return isReservedAppSegment(word) ? word : null
}
export const isPreferencesPageSegment = (value = '') => APP_PAGE_PREFERENCES_ALIASES.includes((value || '').trim().toLowerCase())
export const isWikiPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_WIKI
export const isPrivacyPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_PRIVACY
export const isTermsPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_TERMS
export const isToolsPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_TOOLS
export const isForAppsPageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_FOR_APPS
export const isDevicePageSegment = (value = '') => (value || '').trim().toLowerCase() === APP_PAGE_DEVICE
export const isSpaceContentsSegment = (value = '') => (value || '').trim().toLowerCase() === SPACE_CONTENTS_SEGMENT
export const isScanSegment = (value = '') => (value || '').trim().toLowerCase() === SCAN_SEGMENT

export const buildSpaceContentsPath = (spaceId) => {
    const prefix = getAppBasePrefix()
    if (!spaceId) return prefix ? `${prefix}/` : '/'
    return hostRelative(`${prefix}/${spaceId}/${SPACE_CONTENTS_SEGMENT}`.replace(/\/{2,}/g, '/'))
}

// `/{space}/scan` — one shape and no default space. A scan is always of ONE
// place, and the place is the space; there is no list and nothing to guess.
export const buildScanPath = (spaceId) => {
    const prefix = getAppBasePrefix()
    if (!spaceId) return prefix ? `${prefix}/` : '/'
    return `${prefix}/${spaceId}/${SCAN_SEGMENT}`.replace(/\/{2,}/g, '/')
}

export const buildToolsPath = () => {
    const prefix = getAppBasePrefix()
    return `${prefix}/${APP_PAGE_TOOLS}`.replace(/\/{2,}/g, '/')
}

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
    relative = withHostSpace(relative.replace(/^\/+/g, '').replace(/\/+$/g, ''))
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
        if (isToolsPageSegment(segment)) {
            return {
                page: APP_PAGE_TOOLS,
                spaceId: null
            }
        }
        if (isForAppsPageSegment(segment)) {
            return {
                page: APP_PAGE_FOR_APPS,
                spaceId: null
            }
        }
        if (isDevicePageSegment(segment)) {
            return {
                page: APP_PAGE_DEVICE,
                spaceId: null
            }
        }
        if (segment) {
            const segments = relative.split('/')
            // A space's ops, with the space in the PATH. /admin?space=x kept the space
            // as a query parameter — the one level that owns everything else, demoted
            // to something you could drop and still have a valid URL. The old form
            // keeps parsing above, so no existing link rots.
            // The space's own contents. Checked here, with the other exact
            // two-segment shapes, so it is claimed before the generic
            // /{space}/{projectSlug} rule below could read "projects" as the
            // name of a project — which it never can, the word is reserved,
            // but the parser has to be correct on its own rather than depend
            // on the caller's dispatch order.
            // …and the first segment has to be a space, not a tool: `/raw/projects`
            // and `/studio/projects` are each lane's own space-less form and are
            // claimed by their own parsers. Without this guard they would parse as
            // the contents of a space called "raw" or "studio" — spaces that can
            // never exist, because both words are reserved.
            if (segments.length === 2 && !isReservedAppSegment(segment) && isSpaceContentsSegment(segments[1])) {
                return {
                    page: APP_PAGE_SPACE_CONTENTS,
                    spaceId: segment
                }
            }
            // `/{space}/scan`. Claimed here, with the other exact two-segment
            // shapes, for the same reason: the generic /{space}/{projectSlug}
            // rule below would otherwise read "scan" as the name of a project.
            // The first segment has to be a space and not a lane word, so
            // `/raw/scan` and `/studio/scan` are not somebody's place.
            if (segments.length === 2 && !isReservedAppSegment(segment) && isScanSegment(segments[1])) {
                return {
                    page: APP_PAGE_SCAN,
                    spaceId: segment
                }
            }
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
