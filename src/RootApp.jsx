import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { setAppNavigate } from './utils/appNavigate.js'
import {
    buildRawCanvasPath,
    buildRawProjectPath,
    buildRawProjectsPath,
    getRawLocationState,
    isRawLocation,
    RAW_PAGE_OUT,
    RAW_PAGE_PROJECT,
    RAW_PAGE_PROJECTS
} from './raw/utils/rawRouting.js'
import AuthReturnNotice from './components/AuthReturnNotice.jsx'
import LaneDefaultSpace from './components/LaneDefaultSpace.jsx'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import useSpacePublicFlag from './hooks/useSpacePublicFlag.js'
import useResolveSlugProject from './hooks/useResolveSlugProject.js'
import { buildStudioProjectPath, getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { ALGO_VRITHM_SPACE_ID, isAlgoVrithmSegment } from './algoVrithm/algoVrithmRouting.js'
import { APP_PAGE_EDITOR, APP_PAGE_GARAGE, APP_PAGE_PREFERENCES, APP_PAGE_PRIVACY, APP_PAGE_TERMS, APP_PAGE_WIKI, buildVanityProjectPath, getAppLocationState, TOOL_SEGMENT_RAW, TOOL_SEGMENT_STUDIO } from './utils/spaceRouting.js'

const RawApp = lazy(() => import('./raw/RawApp.jsx'))
const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))
const StudioApp = lazy(() => import('./studio/StudioApp.jsx'))
const WccExperience = lazy(() => import('./wcc/WccExperience.jsx'))
const AlgoVrithmExperience = lazy(() => import('./algoVrithm/AlgoVrithmExperience.jsx'))
// Its own chunk, and deliberately not part of the experience's: the landing
// page draws on a 2D canvas and must never pull three.js for a visitor who has
// not pressed Enter.
const AlgoVrithmLanding = lazy(() => import('./algoVrithm/landing/AlgoVrithmLanding.jsx'))
const WikiPage = lazy(() => import('./wiki/WikiPage.jsx'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'))
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'))
// Its own chunk. The page itself is DOM and SVG; three.js arrives only for the
// headline, one level further down (src/garage/GarageSale.jsx).
const GarageSale = lazy(() => import('./garage/GarageSale.jsx'))
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

// The Raw lane's surfaces. Everything here is an authoring tool and stays
// behind the gate — except the projector image of a project in a PUBLIC space.
//
// `/…/raw/projects/{id}/out` is the one Raw address meant for an audience: a
// read-only render of the room, no chrome, following every edit live. Gated, it
// handed a show machine — or anyone the "Copy projector link" control gave it
// to — a sign-in card instead of the work. The space viewer next door has had
// exactly this bypass all along; the Raw branch simply never got it.
//
// Two limits, both deliberate. The space's own canvas (`/{space}/raw/out`, no
// project) is never public: it renders the VIEWER's localStorage, so to a
// stranger it is their own empty canvas, and nothing is gained by opening it.
// And a private space stays private — this reads the same `isPublic` flag the
// rest of the product does, so "public" keeps meaning one thing.
function RawSurfaceRoute({ rawState, spaceId }) {
    const canBePublic = rawState.page === RAW_PAGE_OUT && Boolean(rawState.projectId)
    const { isPublic, loading } = useSpacePublicFlag(canBePublic ? spaceId : null)

    const surface = (
        <Suspense fallback={<RouteSurfaceFallback label="Loading the node editor" detail="" />}>
            <RawApp initialRoute={{ ...rawState, spaceId }} />
        </Suspense>
    )

    if (canBePublic && loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    if (canBePublic && isPublic) {
        return surface
    }

    return (
        <ProtectedSurface
            requiredSpaceId={spaceId}
            outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
            // The floating account chip must not hang over the show.
            showAccountButton={rawState.page !== RAW_PAGE_OUT}
        >
            {surface}
        </ProtectedSurface>
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
    const rrNavigate = useNavigate()
    const { search, hash } = useLocation()
    const { result, error } = useResolveSlugProject(appState.spaceId, appState.projectSlugSegment)
    const resolvedSpaceId = result?.space?.id || null
    const resolvedProjectId = result?.project?.id || null
    const tool = appState.toolSegment || null
    const hasUnknownTail = Boolean(appState.hasUnknownTail)

    // The doorway. /{space}/{project}/studio|raw is a way to TYPE an address, not an
    // address: once the slug resolves to real ids we hand the visitor the lane's own
    // canonical path and heal the bar — the same treatment the retired /seed segment
    // gets. replace(), so Back leaves the doorway behind instead of bouncing through
    // it. A tail we do not recognise heals to the published project, because the safe
    // destination for an undefined path is never an authoring surface.
    //
    // search + hash are carried across deliberately. Every existing heal in this file
    // drops them, which silently eats ?embed=1 and any deep link a published page
    // hands over — the one thing a URL people type by hand is most likely to carry.
    useEffect(() => {
        if (!resolvedSpaceId || !resolvedProjectId) return
        const keep = `${search || ''}${hash || ''}`
        if (tool === TOOL_SEGMENT_STUDIO) {
            rrNavigate(`${buildStudioProjectPath(resolvedProjectId, resolvedSpaceId)}${keep}`, { replace: true })
        } else if (tool === TOOL_SEGMENT_RAW) {
            rrNavigate(`${buildRawProjectPath(resolvedProjectId, resolvedSpaceId)}${keep}`, { replace: true })
        } else if (hasUnknownTail) {
            rrNavigate(`${buildVanityProjectPath(appState.spaceId, appState.projectSlugSegment)}${keep}`, { replace: true })
        }
    }, [resolvedSpaceId, resolvedProjectId, tool, hasUnknownTail, search, hash,
        appState.spaceId, appState.projectSlugSegment, rrNavigate])

    if (result === undefined && !error) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    if (resolvedSpaceId && resolvedProjectId) {
        // A doorway renders nothing of its own — the effect above is already moving
        // the visitor on. Showing the published page here would flash the wrong
        // surface on the way to the editor.
        if (tool || hasUnknownTail) {
            return (
                <RouteSurfaceFallback
                    label={tool === TOOL_SEGMENT_RAW
                        ? 'Loading the node editor'
                        : tool === TOOL_SEGMENT_STUDIO ? 'Loading Studio' : 'Loading'}
                    detail=""
                />
            )
        }
        return (
            <SpaceSurfaceRoute
                appState={{ page: APP_PAGE_EDITOR, spaceId: resolvedSpaceId, projectId: resolvedProjectId }}
            />
        )
    }

    return <SpaceSurfaceRoute appState={{ page: appState.page, spaceId: appState.spaceId }} />
}

// The doorway on the /{space}/p/{id} form: ids are already real, so this is a heal
// with no resolve step. Kept as its own component because the redirect must run in an
// effect, and the dispatch site it is called from is not a component boundary.
function ProjectToolDoorway({ appState }) {
    const rrNavigate = useNavigate()
    const { search, hash } = useLocation()
    const { spaceId, projectId, toolSegment } = appState

    useEffect(() => {
        const keep = `${search || ''}${hash || ''}`
        const target = toolSegment === TOOL_SEGMENT_RAW
            ? buildRawProjectPath(projectId, spaceId)
            : buildStudioProjectPath(projectId, spaceId)
        rrNavigate(`${target}${keep}`, { replace: true })
    }, [spaceId, projectId, toolSegment, search, hash, rrNavigate])

    return (
        <RouteSurfaceFallback
            label={toolSegment === TOOL_SEGMENT_RAW ? 'Loading the node editor' : 'Loading Studio'}
            detail=""
        />
    )
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
function AlgoVrithmSurfaceRoute({ mode }) {
    const { isPublic, loading } = useSpacePublicFlag(ALGO_VRITHM_SPACE_ID)

    if (loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    const content = (
        <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
            {mode === 'scene' ? <AlgoVrithmExperience /> : <AlgoVrithmLanding />}
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
                : buildRawCanvasPath(rawState.spaceId)
        rrNavigate(target, { replace: true })
    }, [legacyRawPath, rawState.page, rawState.projectId, rawState.spaceId, rrNavigate])
    if (legacyRawPath) {
        return <RouteSurfaceFallback label="Loading the node editor" detail="" />
    }

    if (isStudioLocation(studioState)) {
        const renderStudio = (spaceId) => (
            <ProtectedSurface requiredSpaceId={spaceId} outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}>
                <Suspense
                    fallback={
                        <RouteSurfaceFallback
                            label="Loading Studio"
                            detail=""
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
        const renderRaw = (spaceId) => <RawSurfaceRoute rawState={rawState} spaceId={spaceId} />
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

    if (appState.page === APP_PAGE_GARAGE) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <GarageSale />
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
    const isWccSurface = appState.spaceId === 'wcc'
        && appState.page !== APP_PAGE_PREFERENCES
        && (pathSegments.length === 1 || (pathSegments.length === 2 && pathSegments[1] === 'scene'))
    if (isWccSurface) {
        return <WccSurfaceRoute mode={pathSegments[1] === 'scene' ? 'scene' : 'landing'} />
    }

    // The bare segment is the landing page and `/scene` is the piece; deeper
    // paths under the space (a project deep-link, /admin, …) still belong to
    // the generic surfaces below.
    const isAlgoVrithmSurface = isAlgoVrithmSegment(appState.spaceId)
        && appState.page !== APP_PAGE_PREFERENCES
        && (pathSegments.length === 1 || (pathSegments.length === 2 && pathSegments[1] === 'scene'))
    if (isAlgoVrithmSurface) {
        return <AlgoVrithmSurfaceRoute mode={pathSegments[1] === 'scene' ? 'scene' : 'landing'} />
    }

    if (appState.projectSlugSegment) {
        return <SlugProjectRoute appState={appState} />
    }

    // The same doorway on the /{space}/p/{id} form. It needs no resolve step — the id
    // is already real — so it is a straight heal to the lane's canonical path. Without
    // this, "append the tool word" would be true of the pretty link and quietly false
    // of the permanent one, which is the form published links actually use.
    if (appState.projectId && appState.toolSegment) {
        return <ProjectToolDoorway appState={appState} />
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
