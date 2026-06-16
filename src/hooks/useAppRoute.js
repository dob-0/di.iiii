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

export function useAppRoute({ defaultSpaceId } = {}) {
    const location = useLocation()

    const route = useMemo(() => {
        const appState = getAppLocationState(location)
        return {
            page: appState.page || APP_PAGE_EDITOR,
            spaceId: appState.spaceId || defaultSpaceId
        }
    }, [location, defaultSpaceId])

    const navigate = useCallback((nextRoute, { replace = false } = {}) => {
        const normalizedRoute = {
            page: nextRoute?.page || APP_PAGE_EDITOR,
            spaceId: nextRoute?.spaceId || defaultSpaceId
        }
        const nextPath = normalizedRoute.page === APP_PAGE_PREFERENCES
            ? buildPreferencesPath(normalizedRoute.spaceId)
            : buildAppSpacePath(normalizedRoute.spaceId)
        window.scrollTo(0, 0)
        appNavigate(nextPath, { replace })
    }, [defaultSpaceId])

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
