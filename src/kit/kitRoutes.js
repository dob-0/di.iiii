// Which surface the router gives an address — the contract the Kit's cards are
// checked against, using the very routing modules RootApp.jsx dispatches with.
// A card may only point at an address one of these recognises; if a route is
// renamed or removed, kitCatalogue.test.js fails before a visitor finds the
// dead button.
import { getRawLocationState, isRawLocation } from '../raw/utils/rawRouting.js'
import { getStudioLocationState, isStudioLocation } from '../studio/utils/studioRouting.js'
import { getJamLocationState, isJamLocation } from '../project/routing/jamRouting.js'
import { getMakeLocationState, isMakeLocation } from '../make/makeRouting.js'
import { getMapLocationState, isMapLocation } from '../map/mapRouting.js'
import { getPerformLocationState, isPerformLocation } from '../perform/performRouting.js'
import { getChatLocationState } from '../chat/chatRouting.js'
import { workForSegment } from '../works/segments.js'
import {
    APP_PAGE_FOR_APPS,
    APP_PAGE_PRIVACY,
    APP_PAGE_TERMS,
    APP_PAGE_TOOLS,
    APP_PAGE_WIKI,
    getAppLocationState,
    isSignInPath
} from '../utils/spaceRouting.js'

const PLAIN_PAGES = new Set([APP_PAGE_WIKI, APP_PAGE_PRIVACY, APP_PAGE_TERMS, APP_PAGE_TOOLS, APP_PAGE_FOR_APPS])

const toLocation = (path) => {
    const [pathname, search = ''] = String(path).split('?')
    return { pathname, search: search ? `?${search}` : '' }
}

// The surface an in-app path opens, or null when nothing in the router claims it.
export const describeRoute = (path) => {
    const location = toLocation(path)
    if (isSignInPath(location)) return 'sign-in'
    const chat = getChatLocationState(location)
    if (chat?.isChat) return 'chat'
    if (isJamLocation(getJamLocationState(location))) return 'jam'
    if (isMapLocation(getMapLocationState(location))) return 'projection'
    if (isPerformLocation(getPerformLocationState(location))) return 'perform'
    if (isMakeLocation(getMakeLocationState(location))) return 'make'
    if (isStudioLocation(getStudioLocationState(location))) return 'studio'
    if (isRawLocation(getRawLocationState(location))) return 'nodes'
    const app = getAppLocationState(location)
    if (PLAIN_PAGES.has(app.page)) return app.page
    if (!app.spaceId) return 'front-door'
    if (workForSegment(app.spaceId)) return 'work'
    if (app.projectSlugSegment || app.projectId) return 'project'
    return 'space'
}
