import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { setAppNavigate } from './utils/appNavigate.js'
import { getBetaLocationState, isBetaLocation } from './beta/utils/betaRouting.js'
import {
    buildRawHubPath,
    buildRawProjectPath,
    buildRawProjectsPath,
    getRawLocationState,
    isRawLocation,
    RAW_PAGE_PROJECT,
    RAW_PAGE_PROJECTS
} from './raw/utils/rawRouting.js'
import AuthReturnNotice from './components/AuthReturnNotice.jsx'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import useSpacePublicFlag from './hooks/useSpacePublicFlag.js'
import useResolveSlugProject from './hooks/useResolveSlugProject.js'
import { getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { ALGO_VRITHM_SPACE_ID, isAlgoVrithmSegment } from './algoVrithm/algoVrithmRouting.js'
import { APP_PAGE_EDITOR, APP_PAGE_PREFERENCES, APP_PAGE_WIKI, getAppLocationState } from './utils/spaceRouting.js'

const BetaApp = lazy(() => import('./beta/BetaApp.jsx'))
const RawApp = lazy(() => import('./raw/RawApp.jsx'))
const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))
const StudioApp = lazy(() => import('./studio/StudioApp.jsx'))
const WccExperience = lazy(() => import('./wcc/WccExperience.jsx'))
const AlgoVrithmExperience = lazy(() => import('./algoVrithm/AlgoVrithmExperience.jsx'))
const WikiPage = lazy(() => import('./wiki/WikiPage.jsx'))
// AuthGate pulls in MUI + AccountButton -- lazy so public routes (landing,
// wiki, any public space) that never render a gate don't pay for MUI in
// their eager bundle (2026-07-17 perf audit).
import { OUT_OF_SCOPE_EXPLAIN } from './components/authGateScope.js'
const AuthGate = lazy(() => import('./components/AuthGate.jsx'))

function ProtectedSurface({ children, requiredSpaceId = null, showAccountButton = true, outOfScopeBehavior }) {
    return (
        <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
            <AuthGate requiredSpaceId={requiredSpaceId} showAccountButton={showAccountButton} outOfScopeBehavior={outOfScopeBehavior}>{children}</AuthGate>
        </Suspense>
    )
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

// Resolves the bare /{spaceSlugOrId}/{projectSlugOrId} public link shape —
// docs/architecture/SPEC_space_urls_and_portability.md. On a hit, reuses
// SpaceSurfaceRoute's existing isPublic-gating logic with the REAL resolved
// ids (never the raw, unverified URL segments). On a miss (404, or no
// server API support) falls through to treating segment 0 as a plain space
// route, same as today — /somespace/randomtext never breaks, it just stops
// being a project deep-link and becomes a normal space visit.
function SlugProjectRoute({ appState }) {
    const { result, error } = useResolveSlugProject(appState.spaceId, appState.projectSlugSegment)

    if (result === undefined && !error) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    if (result?.space?.id && result?.project?.id) {
        return (
            <SpaceSurfaceRoute
                appState={{ page: APP_PAGE_EDITOR, spaceId: result.space.id, projectId: result.project.id }}
            />
        )
    }

    return <SpaceSurfaceRoute appState={{ page: appState.page, spaceId: appState.spaceId }} />
}

// wcc is a real space like any other — route it through the same
// server-verified isPublic check instead of assuming it's always public.
function WccSurfaceRoute({ mode }) {
    const { isPublic, loading } = useSpacePublicFlag('wcc')

    if (loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    const content = (
        <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
            <WccExperience initialMode={mode} />
        </Suspense>
    )

    if (isPublic) {
        return content
    }

    return <ProtectedSurface requiredSpaceId="wcc">{content}</ProtectedSurface>
}

// Same shape as WccSurfaceRoute: algovrithm is a real space whose *contents*
// happen to be code rather than a project document, so the public/private
// decision still comes from the server, not from an assumption here.
function AlgoVrithmSurfaceRoute() {
    const { isPublic, loading } = useSpacePublicFlag(ALGO_VRITHM_SPACE_ID)

    if (loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    const content = (
        <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
            <AlgoVrithmExperience />
        </Suspense>
    )

    if (isPublic) {
        return content
    }

    return <ProtectedSurface requiredSpaceId={ALGO_VRITHM_SPACE_ID}>{content}</ProtectedSurface>
}

function AppRouter() {
    const rrNavigate = useNavigate()
    useEffect(() => {
        setAppNavigate(rrNavigate)
        return () => setAppNavigate(null)
    }, [rrNavigate])
    const location = useLocation()
    const betaState = getBetaLocationState(location)
    const rawState = getRawLocationState(location)
    const studioState = getStudioLocationState(location)
    const appState = getAppLocationState(location)

    // The Raw lane was called Seed until 2026-07-30. Old /seed links still
    // resolve; rewrite them to /raw so the address bar heals instead of keeping
    // the retired name in circulation. replace() so Back skips the dead URL
    // rather than bouncing the visitor straight back into the redirect.
    const legacyRawPath = rawState.isRaw && rawState.isLegacyPath
    useEffect(() => {
        if (!legacyRawPath) return
        const target = rawState.page === RAW_PAGE_PROJECT
            ? buildRawProjectPath(rawState.projectId, rawState.spaceId)
            : rawState.page === RAW_PAGE_PROJECTS
                ? buildRawProjectsPath(rawState.spaceId)
                : buildRawHubPath(rawState.spaceId)
        rrNavigate(target, { replace: true })
    }, [legacyRawPath, rawState.page, rawState.projectId, rawState.spaceId, rrNavigate])
    if (legacyRawPath) {
        return <RouteSurfaceFallback label="Loading Raw" detail="" />
    }

    if (isStudioLocation(studioState)) {
        return (
            <ProtectedSurface requiredSpaceId={studioState.spaceId} outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}>
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
            <ProtectedSurface requiredSpaceId={betaState.spaceId} outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}>
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

    if (isRawLocation(rawState)) {
        return (
            <ProtectedSurface requiredSpaceId={rawState.spaceId} outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}>
                <Suspense
                    fallback={
                        <RouteSurfaceFallback
                            label="Loading Raw"
                            detail="Preparing the node-graph workspace..."
                        />
                    }
                >
                    <RawApp initialRoute={rawState} />
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
        return <WccSurfaceRoute mode={pathSegments[1] === 'scene' ? 'scene' : 'landing'} />
    }

    // Single-segment only: deeper paths under the space (a project deep-link,
    // /admin, …) still belong to the generic surfaces below.
    const isAlgoVrithmSurface = isAlgoVrithmSegment(appState.spaceId)
        && appState.page !== APP_PAGE_PREFERENCES
        && pathSegments.length === 1
    if (isAlgoVrithmSurface) {
        return <AlgoVrithmSurfaceRoute />
    }

    if (appState.projectSlugSegment) {
        return <SlugProjectRoute appState={appState} />
    }

    return <SpaceSurfaceRoute appState={appState} />
}

export default function RootApp() {
    return (
        <BrowserRouter>
            <AuthReturnNotice />
            <AppRouter />
        </BrowserRouter>
    )
}
