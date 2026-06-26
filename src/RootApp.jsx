import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { setAppNavigate } from './utils/appNavigate.js'
import { getBetaLocationState, isBetaLocation } from './beta/utils/betaRouting.js'
import AuthGate from './components/AuthGate.jsx'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import useSpacePublicFlag from './hooks/useSpacePublicFlag.js'
import { getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { APP_PAGE_PREFERENCES, APP_PAGE_WIKI, getAppLocationState } from './utils/spaceRouting.js'

const BetaApp = lazy(() => import('./beta/BetaApp.jsx'))
const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))
const StudioApp = lazy(() => import('./studio/StudioApp.jsx'))
const WccExperience = lazy(() => import('./wcc/WccExperience.jsx'))
const WikiPage = lazy(() => import('./wiki/WikiPage.jsx'))

function ProtectedSurface({ children, requiredSpaceId = null, showAccountButton = true }) {
    return <AuthGate requiredSpaceId={requiredSpaceId} showAccountButton={showAccountButton}>{children}</AuthGate>
}

function SpaceSurfaceRoute({ appState }) {
    const canBePublic = appState.page !== APP_PAGE_PREFERENCES
    const { isPublic, loading } = useSpacePublicFlag(canBePublic ? appState.spaceId : null)

    if (canBePublic && loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    if (canBePublic && isPublic) {
        return <SpaceSurfaceApp routeState={appState} />
    }

    return (
        <ProtectedSurface requiredSpaceId={appState.spaceId}>
            <SpaceSurfaceApp routeState={appState} />
        </ProtectedSurface>
    )
}

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
            <ProtectedSurface requiredSpaceId={studioState.spaceId}>
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
            </ProtectedSurface>
        )
    }

    if (isBetaLocation(betaState)) {
        return (
            <ProtectedSurface requiredSpaceId={betaState.spaceId}>
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
            </ProtectedSurface>
        )
    }

    if (appState.page === APP_PAGE_WIKI) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <WikiPage />
            </Suspense>
        )
    }

    const isRootLanding = !appState.spaceId
        && appState.page !== APP_PAGE_PREFERENCES
        && appState.page !== APP_PAGE_WIKI

    if (isRootLanding) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <LandingPage />
            </Suspense>
        )
    }

    const pathSegments = location.pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/')
    const isWccSurface = appState.spaceId === 'wcc'
        && appState.page !== APP_PAGE_PREFERENCES
        && (pathSegments.length === 1 || (pathSegments.length === 2 && pathSegments[1] === 'scene'))
    if (isWccSurface) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <WccExperience initialMode={pathSegments[1] === 'scene' ? 'scene' : 'landing'} />
            </Suspense>
        )
    }

    return <SpaceSurfaceRoute appState={appState} />
}

export default function RootApp() {
    return (
        <BrowserRouter>
            <AppRouter />
        </BrowserRouter>
    )
}
