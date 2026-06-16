import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { setAppNavigate } from './utils/appNavigate.js'
import { getBetaLocationState, isBetaLocation } from './beta/utils/betaRouting.js'
import AuthGate from './components/AuthGate.jsx'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import { getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { APP_PAGE_PREFERENCES, getAppLocationState } from './utils/spaceRouting.js'

const BetaApp = lazy(() => import('./beta/BetaApp.jsx'))
const BlankNodeWorkspaceApp = lazy(() => import('./beta/BlankNodeWorkspaceApp.jsx'))
const StudioApp = lazy(() => import('./studio/StudioApp.jsx'))

function AppRouter() {
    const rrNavigate = useNavigate()
    useEffect(() => {
        setAppNavigate(rrNavigate)
        return () => setAppNavigate(null)
    }, [rrNavigate])
    const location = useLocation()
    const betaState = getBetaLocationState(location)
    const studioState = getStudioLocationState(location)
    const appState = getAppLocationState(location)

    if (isStudioLocation(studioState)) {
        return (
            <Suspense
                fallback={
                    <RouteSurfaceFallback
                        label="Loading Studio"
                        detail="Preparing the main authoring workspace..."
                    />
                }
            >
                <StudioApp initialRoute={studioState} />
            </Suspense>
        )
    }

    if (isBetaLocation(betaState)) {
        return (
            <Suspense
                fallback={
                    <RouteSurfaceFallback
                        label="Loading Beta"
                        detail="Preparing the experimental workspace..."
                    />
                }
            >
                <BetaApp initialRoute={betaState} />
            </Suspense>
        )
    }

    const isRootLanding = !appState.spaceId && appState.page !== APP_PAGE_PREFERENCES

    if (isRootLanding) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="Preparing workspace..." />}>
                <BlankNodeWorkspaceApp />
            </Suspense>
        )
    }

    return <SpaceSurfaceApp routeState={appState} />
}

export default function RootApp() {
    return (
        <BrowserRouter>
            <AuthGate>
                <AppRouter />
            </AuthGate>
        </BrowserRouter>
    )
}
