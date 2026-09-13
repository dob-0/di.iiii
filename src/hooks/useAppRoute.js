import { useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import {
    APP_PAGE_EDITOR,
    APP_PAGE_PREFERENCES,
    buildAppSpacePath,
    buildPreferencesPath,
    getAppLocationState
} from '../utils/spaceRouting.js'
import { appNavigate } from '../utils/appNavigate.js'

// `spaceId` (optional) is the space's real id, already resolved from the URL
// segment by the route that mounted this surface. The segment is only a name —
// a space answers to its id AND to its renameable public slug — so the route's
// answer wins for identity, and the segment is kept for building addresses so
// the bar goes on saying what the visitor typed.
export function useAppRoute({ defaultSpaceId, spaceId: resolvedSpaceId = null } = {}) {
    const location = useLocation()

    const route = useMemo(() => {
        const appState = getAppLocationState(location)
        const spaceSegment = appState.spaceId || defaultSpaceId
        return {
            page: appState.page || APP_PAGE_EDITOR,
            spaceId: resolvedSpaceId || spaceSegment,
            spaceSegment
        }
    }, [location, defaultSpaceId, resolvedSpaceId])

    const navigate = useCallback((nextRoute, { replace = false } = {}) => {
        const normalizedRoute = {
            page: nextRoute?.page || APP_PAGE_EDITOR,
            spaceId: nextRoute?.spaceId || defaultSpaceId
        }
        // Moving between this space's own pages keeps the address the visitor
        // arrived on — a slug in the bar must survive /admin and back.
        const pathSpaceId = normalizedRoute.spaceId === route.spaceId
            ? route.spaceSegment
            : normalizedRoute.spaceId
        const nextPath = normalizedRoute.page === APP_PAGE_PREFERENCES
            ? buildPreferencesPath(pathSpaceId)
            : buildAppSpacePath(pathSpaceId)
        window.scrollTo(0, 0)
        appNavigate(nextPath, { replace })
    }, [defaultSpaceId, route.spaceId, route.spaceSegment])

    const navigateToEditor = useCallback((spaceId = route.spaceId) => {
        navigate({ page: APP_PAGE_EDITOR, spaceId })
    }, [navigate, route.spaceId])

    const navigateToPreferences = useCallback((spaceId = route.spaceId) => {
        navigate({ page: APP_PAGE_PREFERENCES, spaceId })
    }, [navigate, route.spaceId])

    return {
        route,
        navigate,
        navigateToEditor,
        navigateToPreferences
    }
}

export default useAppRoute
