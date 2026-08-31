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
import ModeMark from './components/ModeMark.jsx'
import LaneDefaultSpace from './components/LaneDefaultSpace.jsx'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import useLocalInstall from './hooks/useLocalInstall.js'
import useSpacePublicFlag from './hooks/useSpacePublicFlag.js'
import useResolveSlugProject from './hooks/useResolveSlugProject.js'
import { buildStudioProjectPath, getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { getJamLocationState, isJamLocation } from './project/routing/jamRouting.js'
import { getMakeLocationState, isMakeLocation } from './make/makeRouting.js'
import { getMapLocationState, isMapLocation } from './map/mapRouting.js'
import { workSurface } from './works/routes.jsx'
import { workForSegment } from './works/segments.js'
import { APP_PAGE_EDITOR, APP_PAGE_PREFERENCES, APP_PAGE_PRIVACY, APP_PAGE_TERMS, APP_PAGE_WIKI, buildVanityProjectPath, getAppLocationState, TOOL_SEGMENT_RAW, TOOL_SEGMENT_STUDIO } from './utils/spaceRouting.js'

const RawApp = lazy(() => import('./raw/RawApp.jsx'))
// The jam as a place you stand in. Its own chunk: it reaches three.js through
// the walker, and no other route should pay for that.
const JamSurface = lazy(() => import('./project/components/JamSurface.jsx'))
// The toybox. Its own chunk for the same reason the jam has one: it reaches
// three.js through RawViewport, and no other route should pay for that.
const MakeSurface = lazy(() => import('./make/MakeSurface.jsx'))
const MapSurface = lazy(() => import('./map/MapSurface.jsx'))
const MapOutput = lazy(() => import('./map/MapOutput.jsx'))
const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))
// What `di up` opens on your own machine: your spaces, not a tour of a hosted
// product you have already installed. Lazy so a hosted visitor never downloads
// MUI to render a page that will not use it.
const LocalHome = lazy(() => import('./landing/LocalHome.jsx'))
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
    // Unconditional, at the top: the answer decides what "/" renders, and a
    // hook behind an if is not a hook.
    const localInstall = useLocalInstall()
    const rawState = getRawLocationState(location)
    const studioState = getStudioLocationState(location)
    const jamState = getJamLocationState(location)
    const makeState = getMakeLocationState(location)
    const mapState = getMapLocationState(location)
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

    // `/open_jam/scene` — the jam as a place you stand in, beside the editor at
    // `/open_jam` rather than instead of it. Dispatched first because it is the
    // most specific address in this function: one exact two-segment path, and
    // nothing else can match it.
    //
    // Behind the same gate as the editor next door, with the same required
    // space, so the guest session an event visitor arrives on is created and
    // scoped exactly as it always was — a jam has no new access story.
    if (isJamLocation(jamState)) {
        return (
            <ProtectedSurface requiredSpaceId={jamState.spaceId} outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}>
                <Suspense fallback={<RouteSurfaceFallback label="Loading the jam" detail="" />}>
                    <JamSurface projectId={jamState.projectId} spaceId={jamState.spaceId} />
                </Suspense>
            </ProtectedSurface>
        )
    }

    // `/{space}/make/{projectId}` — the toybox (src/make/MakeSurface.jsx). Same
    // project document and same op layer as Raw next door; a different lid.
    //
    // Dispatched here, beside the jam, because it is the same kind of address:
    // one exact three-segment path with the lane word in the middle, nothing
    // else can match it, and it must be claimed before the generic
    // /{space}/{projectSlug} shape further down reads "make" as a project.
    //
    // Behind the same gate as Raw, with the same required space, because it
    // edits the same document — a surface that writes must never be reachable
    // on terms the surface it writes through would refuse. A guest holding a
    // redeemed space invite carries `role: editor` scoped to that space and
    // passes exactly as they do into Raw. No account chip: the whole design is
    // four thumb-sized words and the platform's floating chip lands on the
    // fourth one.
    // `/{space}/map/{projectId}` and `/{space}/map/{projectId}/out` — the
    // projection mapper (src/map/). Dispatched here with the other lane words
    // for the same reason Make is: the shape is exact, and the generic
    // /{space}/{projectSlug} rule further down would otherwise read "map" as
    // the name of a project.
    //
    // Behind the same gate as Raw and Make, because the desk writes to the
    // project document through the same op layer. The OUTPUT is behind it too
    // — it is the same document, and a signal that could be opened on terms
    // the desk would refuse is a way to read a private space off a wall.
    //
    // No account chip on the output: it is a projector's picture, and a
    // floating button would be projected onto the wall along with the work.
    if (isMapLocation(mapState)) {
        return (
            <ProtectedSurface
                requiredSpaceId={mapState.spaceId}
                outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
                showAccountButton={!mapState.isOutput}
            >
                <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                    {mapState.isOutput
                        ? <MapOutput projectId={mapState.projectId} spaceId={mapState.spaceId} />
                        : <MapSurface projectId={mapState.projectId} spaceId={mapState.spaceId} />}
                </Suspense>
            </ProtectedSurface>
        )
    }

    if (isMakeLocation(makeState)) {
        return (
            <ProtectedSurface
                requiredSpaceId={makeState.spaceId}
                outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
                showAccountButton={false}
            >
                <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                    <MakeSurface projectId={makeState.projectId} spaceId={makeState.spaceId} />
                </Suspense>
            </ProtectedSurface>
        )
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

    const isRootLanding = !appState.spaceId
        && appState.page !== APP_PAGE_PREFERENCES
        && appState.page !== APP_PAGE_WIKI
        && appState.page !== APP_PAGE_PRIVACY
        && appState.page !== APP_PAGE_TERMS

    if (isRootLanding) {
        // ?tour=1 keeps the landing reachable on a local install — the tour is
        // moved, not deleted, and the local home links to it by name.
        const wantsTour = new URLSearchParams(location.search).get('tour') === '1'
        if (localInstall.isLocal && !wantsTour) {
            return (
                <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                    <LocalHome />
                </Suspense>
            )
        }
        // Held only while an already-local-looking address waits for the
        // server's word — a hosted visitor is never here.
        if (!localInstall.resolved) {
            return <RouteSurfaceFallback label="Loading" detail="" />
        }
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
            <ModeMark />
            <AppRouter />
        </BrowserRouter>
    )
}
