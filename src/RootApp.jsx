import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { setAppNavigate } from './utils/appNavigate.js'
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
import LaneDefaultSpace from './components/LaneDefaultSpace.jsx'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import useSpacePublicFlag from './hooks/useSpacePublicFlag.js'
import useResolveSlugProject from './hooks/useResolveSlugProject.js'
import { getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { workSurface } from './works/routes.jsx'
import { workForSegment } from './works/segments.js'
import { APP_PAGE_EDITOR, APP_PAGE_PREFERENCES, APP_PAGE_PRIVACY, APP_PAGE_TERMS, APP_PAGE_WIKI, getAppLocationState } from './utils/spaceRouting.js'

const RawApp = lazy(() => import('./raw/RawApp.jsx'))
const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))
const StudioApp = lazy(() => import('./studio/StudioApp.jsx'))
// Its own chunk, and deliberately not part of the experience's: the landing
// page draws on a 2D canvas and must never pull three.js for a visitor who has
// not pressed Enter.
const WikiPage = lazy(() => import('./wiki/WikiPage.jsx'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'))
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'))
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

// One route for every work in src/works/works.js. This was two components —
// WccSurfaceRoute and AlgoVrithmSurfaceRoute — structurally identical down to
// the comments, and a third work would have been a third copy. A work is a
// real space like any other, so the public/private decision comes from the
// server here too, never from an assumption in the router.
function WorkSurfaceRoute({ work, mode }) {
    const { isPublic, loading } = useSpacePublicFlag(work.id)
    const render = workSurface(work.id)

    if (loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    const content = (
        <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
            {render ? render(mode) : null}
        </Suspense>
    )

    if (isPublic) {
        return content
    }

    return <ProtectedSurface requiredSpaceId={work.id}>{content}</ProtectedSurface>
}

function AppRouter() {
    const rrNavigate = useNavigate()
    useEffect(() => {
        setAppNavigate(rrNavigate)
        return () => setAppNavigate(null)
    }, [rrNavigate])
    const location = useLocation()
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
        const renderStudio = (spaceId) => (
            <ProtectedSurface requiredSpaceId={spaceId} outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}>
                <Suspense
                    fallback={
                        <RouteSurfaceFallback
                            label="Loading Studio"
                            detail="Preparing the main authoring workspace..."
                        />
                    }
                >
                    <StudioApp initialRoute={{ ...studioState, spaceId }} />
                </Suspense>
            </ProtectedSurface>
        )
        // A defaulted (not URL-named) space bends to what the session can
        // actually enter — see LaneDefaultSpace.
        return studioState.isDefaultSpace
            ? <LaneDefaultSpace state={studioState}>{renderStudio}</LaneDefaultSpace>
            : renderStudio(studioState.spaceId)
    }

    if (isRawLocation(rawState)) {
        const renderRaw = (spaceId) => (
            <ProtectedSurface requiredSpaceId={spaceId} outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}>
                <Suspense
                    fallback={
                        <RouteSurfaceFallback
                            label="Loading Raw"
                            detail="Preparing the node-graph workspace..."
                        />
                    }
                >
                    <RawApp initialRoute={{ ...rawState, spaceId }} />
                </Suspense>
            </ProtectedSurface>
        )
        return rawState.isDefaultSpace
            ? <LaneDefaultSpace state={rawState}>{renderRaw}</LaneDefaultSpace>
            : renderRaw(rawState.spaceId)
    }

    if (appState.page === APP_PAGE_WIKI) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <WikiPage />
            </Suspense>
        )
    }

    // Top-level /privacy and /terms for now — may need to move under the /-/
    // namespace once SPEC_url_architecture_and_tree_addressing.md is signed off.
    if (appState.page === APP_PAGE_PRIVACY) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <PrivacyPage />
            </Suspense>
        )
    }

    if (appState.page === APP_PAGE_TERMS) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <TermsPage />
            </Suspense>
        )
    }

    const isRootLanding = !appState.spaceId
        && appState.page !== APP_PAGE_PREFERENCES
        && appState.page !== APP_PAGE_WIKI
        && appState.page !== APP_PAGE_PRIVACY
        && appState.page !== APP_PAGE_TERMS

    if (isRootLanding) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <LandingPage />
            </Suspense>
        )
    }

    const pathSegments = location.pathname.replace(/^\/+/, '').replace(/\/+$/, '').split('/')
    // The bare segment is the work's landing page and `/scene` is the piece;
    // deeper paths under the space (a project deep-link, /admin, …) still
    // belong to the generic surfaces below.
    const work = appState.page !== APP_PAGE_PREFERENCES ? workForSegment(appState.spaceId) : null
    const isWorkSurface = work
        && (pathSegments.length === 1 || (pathSegments.length === 2 && pathSegments[1] === 'scene'))
    if (isWorkSurface) {
        return <WorkSurfaceRoute work={work} mode={pathSegments[1] === 'scene' ? 'scene' : 'landing'} />
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
