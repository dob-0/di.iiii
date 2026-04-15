import { useCallback, useEffect, useState } from 'react'
import {
    APP_PAGE_EDITOR,
    APP_PAGE_PREFERENCES,
    buildAppSpacePath,
    buildPreferencesPath,
    getAppLocationState
} from '../utils/spaceRouting.js'

export function useAppRoute({ defaultSpaceId } = {}) {
    const readRoute = useCallback(() => {
        const route = getAppLocationState()
        return {
            page: route.page || APP_PAGE_EDITOR,
            spaceId: route.spaceId || defaultSpaceId
        }
    }, [defaultSpaceId])

    const [route, setRoute] = useState(() => readRoute())

    useEffect(() => {
        if (typeof window === 'undefined') return undefined

        const handlePopState = () => {
            setRoute(readRoute())
        }

        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [readRoute])

    const navigate = useCallback((nextRoute, { replace = false } = {}) => {
        if (typeof window === 'undefined') return

        const normalizedRoute = {
            page: nextRoute?.page || APP_PAGE_EDITOR,
            spaceId: nextRoute?.spaceId || defaultSpaceId
        }
        const nextPath = normalizedRoute.page === APP_PAGE_PREFERENCES
            ? buildPreferencesPath(normalizedRoute.spaceId)
            : buildAppSpacePath(normalizedRoute.spaceId)
        const historyMethod = replace ? 'replaceState' : 'pushState'

        window.history[historyMethod]({}, '', nextPath)
        window.scrollTo(0, 0)
        setRoute(normalizedRoute)
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
