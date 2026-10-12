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
    RAW_PAGE_PROJECTS,
    rawShowsFloatingAccount,
} from './raw/utils/rawRouting.js'
import AuthReturnNotice from './components/AuthReturnNotice.jsx'
import ModeMark from './components/ModeMark.jsx'
import TreeChip from './components/TreeChip.jsx'
import LaneDefaultSpace from './components/LaneDefaultSpace.jsx'
import RouteSurfaceFallback from './components/RouteSurfaceFallback.jsx'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'
import useDocumentTitle from './hooks/useDocumentTitle.js'
import useLocalInstall from './hooks/useLocalInstall.js'
import useSpacePublicFlag from './hooks/useSpacePublicFlag.js'
import useAuthSession from './hooks/useAuthSession.js'
import { hasServerApi } from './services/apiClient.js'
import { isSpaceInSessionScope } from './utils/sessionScope.js'
import { rigToolAccess } from './rigbuild/rigToolAccess.js'
import useResolveSlugProject from './hooks/useResolveSlugProject.js'
import { buildStudioProjectPath, getStudioLocationState, isStudioLocation } from './studio/utils/studioRouting.js'
import { getJamLocationState, isJamLocation } from './project/routing/jamRouting.js'
import { getMakeLocationState, isMakeLocation } from './make/makeRouting.js'
import { getMapLocationState, isMapLocation } from './map/mapRouting.js'
import { getPerformLocationState, isPerformLocation } from './perform/performRouting.js'
import { getPatchSheetLocationState, isPatchSheetLocation } from './rigbuild/patchRouting.js'
import { getVisualiseLocationState, isVisualiseLocation } from './rigbuild/visualiseRouting.js'
import { getTouchLocationState, isTouchLocation, touchDeskPath } from './rigbuild/touchRouting.js'
import TouchForward from './rigbuild/TouchForward.jsx'
import { getPlotLocationState, isPlotLocation } from './rigbuild/plotRouting.js'
import { getCardsLocationState, isCardsLocation } from './rigbuild/cardsRouting.js'
import { getScenesLocationState, isScenesLocation } from './rigbuild/scenesRouting.js'
import { getShowLocationState, isShowLocation } from './rigbuild/showRouting.js'
import { getEquipmentLocationState, isEquipmentLocation } from './rigbuild/equipmentRouting.js'
import { getBuildLocationState, isBuildLocation } from './rigbuild/buildRouting.js'
import { getChatLocationState, getPrivateChatTarget } from './chat/chatRouting.js'
import { workSurface } from './works/routes.jsx'
import { workForSegment } from './works/segments.js'
import { APP_PAGE_EDITOR, APP_PAGE_FOR_APPS, APP_PAGE_PREFERENCES, APP_PAGE_PRIVACY, APP_PAGE_SHOOT, APP_PAGE_SCAN, APP_PAGE_SPACE_CONTENTS, APP_PAGE_TERMS, APP_PAGE_TOOLS, APP_PAGE_WIKI, buildPublicProjectPath, buildVanityProjectPath, getAppLocationState, getBareReservedSegment, isSignInPath, TOOL_SEGMENT_RAW, TOOL_SEGMENT_STUDIO } from './utils/spaceRouting.js'
import ReservedAddressCard, { hasReservedAddressCard } from './components/ReservedAddressCard.jsx'

const RawApp = lazy(() => import('./raw/RawApp.jsx'))
// The jam as a place you stand in. Its own chunk: it reaches three.js through
// the walker, and no other route should pay for that.
const JamSurface = lazy(() => import('./project/components/JamSurface.jsx'))
// The toybox. Its own chunk for the same reason the jam has one: it reaches
// three.js through RawViewport, and no other route should pay for that.
const MakeSurface = lazy(() => import('./make/MakeSurface.jsx'))
// The studio's chat room. Its own chunk, and a small one on purpose: this is
// the page a phone installs and opens on a bad connection, and it must never
// pull three.js to show a list of sentences.
const StudioChatSurface = lazy(() => import('./chat/StudioChatSurface.jsx'))
// A private conversation carries WebRTC and the crypto, which the room itself
// has no use for — its own chunk, loaded only when somebody opens one.
const PrivateChatSurface = lazy(() => import('./chat/PrivateChatSurface.jsx'))
const ChatHomeSurface = lazy(() => import('./chat/ChatHomeSurface.jsx'))
const MapSurface = lazy(() => import('./map/MapSurface.jsx'))
const MapOutput = lazy(() => import('./map/MapOutput.jsx'))
const PerformApp = lazy(() => import('./perform/PerformApp.jsx'))
const ScanSurface = lazy(() => import('./scan/ScanSurface.jsx'))
// `/tools` — the Kit (src/kit/KitPage.jsx). Its own chunk: a page of cards and
// stills, which must never pull three.js for a phone that has not asked a card
// to go live.
const KitPage = lazy(() => import('./kit/KitPage.jsx'))
const PatchSheetSurface = lazy(() => import('./rigbuild/PatchSheetSurface.jsx'))
const VisualiserSurface = lazy(() => import('./rigbuild/VisualiserSurface.jsx'))
const PlotSurface = lazy(() => import('./rigbuild/PlotSurface.jsx'))
const CardsSurface = lazy(() => import('./rigbuild/CardsSurface.jsx'))
const ScenesSurface = lazy(() => import('./rigbuild/ScenesSurface.jsx'))
// The show page: its own small chunk, no WebGL — a phone in a dark hall opens it.
const ShowSurface = lazy(() => import('./rigbuild/ShowSurface.jsx'))
const EquipmentSurface = lazy(() => import('./rigbuild/EquipmentSurface.jsx'))
const BuildSurface = lazy(() => import('./rigbuild/BuildSurface.jsx'))
const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))

// The space `/` opens. Kept in step with GridFloorBackground's PREFERRED_SPACE_ID
// and MadeWithBadge's PLATFORM_HOME_SPACE_ID — all three name the same room.
const PLATFORM_HOME_SPACE_ID = 'main'
// What `di up` opens on your own machine: your spaces, not a tour of a hosted
// product you have already installed. Lazy so a hosted visitor never downloads
// MUI to render a page that will not use it.
const LocalHome = lazy(() => import('./landing/LocalHome.jsx'))
const StudioApp = lazy(() => import('./studio/StudioApp.jsx'))
// Its own chunk, and deliberately not part of the experience's: the landing
// page draws on a 2D canvas and must never pull three.js for a visitor who has
// not pressed Enter.
const WikiPage = lazy(() => import('./wiki/WikiPage.jsx'))
// `/{space}/projects` — everything a space holds. Its own chunk: it is a list of
// links and must never pull three.js for a visitor who only wants to read what
// is in a space.
const SpaceContentsPage = lazy(() => import('./pages/SpaceContentsPage.jsx'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'))
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'))
const ForAppsPage = lazy(() => import('./pages/ForAppsPage.jsx'))
const ShootPage = lazy(() => import('./pages/shoot/ShootPage.jsx'))
// AuthGate pulls in MUI + AccountButton -- lazy so public routes (landing,
// wiki, any public space) that never render a gate don't pay for MUI in
// their eager bundle (2026-07-17 perf audit).
import { OUT_OF_SCOPE_EXPLAIN } from './components/authGateScope.js'
const AuthGate = lazy(() => import('./components/AuthGate.jsx'))
const SignInSurface = lazy(() => import('./components/AuthGate.jsx').then((m) => ({ default: m.SignInSurface })))

function ProtectedSurface({ children, requiredSpaceId = null, showAccountButton = true, outOfScopeBehavior, outOfScopeMessage = null }) {
    return (
        <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
            <AuthGate
                requiredSpaceId={requiredSpaceId}
                showAccountButton={showAccountButton}
                outOfScopeBehavior={outOfScopeBehavior}
                outOfScopeMessage={outOfScopeMessage}
            >{children}</AuthGate>
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
            showAccountButton={rawShowsFloatingAccount(rawState)}
        >
            {surface}
        </ProtectedSurface>
    )
}

// A full page load of /light on a local install never gets here — serverXR
// answers it before index.html exists. A client-side navigation can, and the
// desk is not a React route, so the only way to reach it is to leave the SPA.
// The query goes along: ?space=&project= is how the desk knows which project
// sent the person and draws the way back (serverXR/src/lighting/ui/from.js).
function LocalLightingDeskHandoff() {
    useEffect(() => { window.location.assign(`/light/${window.location.search}${window.location.hash}`) }, [])
    return <RouteSurfaceFallback label="Opening the lighting desk" detail="" />
}

// The rig tools — plot, cards, equipment, build (src/rigbuild/rigToolAccess.js). A member
// in scope, an admin, or a local install gets the tool through the gate as before; anyone
// else on a PUBLIC space gets the same page read only instead of a sign-in card (the
// build room as the crew view); a private space stays behind the gate. Same session and
// scope reading as AuthGate (sessionScope.js) — both already in this chunk through
// LaneDefaultSpace — so nothing of the gate's own chunk is pulled in here.
function RigToolRoute({ spaceId, surface }) {
    const session = useAuthSession()
    const inScope = Boolean(session.authenticated) && isSpaceInSessionScope(session, spaceId)
    const member = !session.loading && (!session.requireAuth || session.local || (session.authenticated && (session.role === 'admin' || inScope)))
    const { isPublic, loading: publicLoading } = useSpacePublicFlag(hasServerApi && !session.loading && !member ? spaceId : null)
    const access = rigToolAccess({ hasServerApi, session, sessionLoading: session.loading, inScope, isPublic, publicLoading })
    const fallback = <RouteSurfaceFallback label="Loading" detail="" />
    if (access === 'loading') return fallback
    if (access === 'view') return <Suspense fallback={fallback}>{surface(true)}</Suspense>
    return (
        <ProtectedSurface
            requiredSpaceId={spaceId}
            outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
            showAccountButton={false}
        >
            <Suspense fallback={fallback}>{surface(false)}</Suspense>
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

// `/{space}/projects` — the space's contents (src/pages/SpaceContentsPage.jsx).
//
// Gated exactly the way the space itself is, by the same hook and the same
// isPublic flag SpaceSurfaceRoute and RawSurfaceRoute read: a public space's
// contents are as public as the space, a private space's contents stay behind
// the gate. Nothing here decides access on its own — "public" keeps meaning one
// thing, and the server enforces it again on /api/spaces/:id/contents whatever
// this component believes.
//
// Which PROJECTS the page lists is a separate question with a separate answer,
// and that one is only ever answered on the server: drafts and archived work
// never reach a visitor. See serverXR/src/routes/projectRoutes.js.
function SpaceContentsRoute({ spaceId }) {
    const { isPublic, loading } = useSpacePublicFlag(spaceId)

    if (loading) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    const page = (
        <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
            <SpaceContentsPage spaceId={spaceId} />
        </Suspense>
    )

    if (isPublic) {
        return page
    }

    return <ProtectedSurface requiredSpaceId={spaceId}>{page}</ProtectedSurface>
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
    // scripts/project-move.mjs moved this project out of appState.spaceId —
    // the server already checked project_moves (serverXR/src/index.js
    // /api/resolve/:spaceSegment/:projectSegment) and named where it lives
    // now. buildPublicProjectPath (the /p/ form), not the vanity slug: a move
    // doesn't carry the OLD slug into the new space, only the id is certain.
    const movedTo = result?.movedTo || null
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

    useEffect(() => {
        if (!movedTo?.spaceId || !movedTo?.projectId) return
        const keep = `${search || ''}${hash || ''}`
        rrNavigate(`${buildPublicProjectPath(movedTo.spaceId, movedTo.projectId)}${keep}`, { replace: true })
    }, [movedTo?.spaceId, movedTo?.projectId, search, hash, rrNavigate])

    if (result === undefined && !error) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    if (movedTo?.spaceId && movedTo?.projectId) {
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
    // A work is a real space like any other (see the comment above this
    // function) so it names itself the same way one does — the naming rule
    // in docs/ai/vocabulary.md. Unlike a generic space this one is code, not
    // a fetched record, so the label is already known: no "ready" gate to
    // wait on.
    useDocumentTitle(`${work.label} — di.iiii`)
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
    const performState = getPerformLocationState(location)
    const patchSheetState = getPatchSheetLocationState(location)
    const visualiseState = getVisualiseLocationState(location)
    const touchState = getTouchLocationState(location)
    const plotState = getPlotLocationState(location)
    const cardsState = getCardsLocationState(location)
    const scenesState = getScenesLocationState(location)
    const showState = getShowLocationState(location)
    const equipmentState = getEquipmentLocationState(location)
    const buildState = getBuildLocationState(location)
    const chatState = getChatLocationState(location)
    const privateChatWith = getPrivateChatTarget(location)
    const appState = getAppLocationState(location)
    const bareReserved = getBareReservedSegment(location)

    // `/open` and its `/open_jam(/scene)` aliases are one space, named the
    // same way everywhere per the naming rule (docs/ai/vocabulary.md) — but
    // this route renders JamSurface, a live editable surface, not the
    // generic read-only PublicProjectViewer that SpaceSurfaceApp already
    // titles from the fetched space label. Without this the tab kept
    // whatever the previous page had left in it, usually index.html's
    // generic default. JAM_SPACE_ID is fixed to the 'open' space (see
    // jamRouting.js), so the name is safe to hardcode instead of waiting on
    // a fetch just for a tab title.
    useDocumentTitle(isJamLocation(jamState) ? 'Open Space — di.iiii' : null)

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
    // `/main` heals to `/?room=1`. Two promises have to hold at once. The name
    // never appears in the bar — a visitor should never be told the room they
    // are standing in is called "main" — AND a link already handed out keeps
    // showing what it showed. Healing to the bare `/` kept the first and broke
    // the second: `/main` had opened the room for months, and after the front
    // door moved back to `/` it would have started answering with a landing
    // page instead. `?room=1` is the room without the door, so the old link
    // arrives where it always did, under a name that is no longer a name.
    // Only the BARE path heals: `/main/studio`, `/main/raw/…` and `/main/p/…`
    // are the editor and project addresses inside that space and keep theirs.
    // Not on a local install: there `/` is the owner's own home (their spaces),
    // so healing this path would answer "show me the room" with a different
    // page entirely. `isLocal` is already false once a local server turns auth
    // on, which is the case where `/` does open the room.
    const isBareHomeSpacePath = location.pathname.replace(/\/+$/, '') === `/${PLATFORM_HOME_SPACE_ID}`
        && localInstall.resolved && !localInstall.isLocal
    useEffect(() => {
        if (!isBareHomeSpacePath) return
        const params = new URLSearchParams(location.search)
        params.set('room', '1')
        rrNavigate(`/?${params.toString()}${location.hash || ''}`, { replace: true })
    }, [isBareHomeSpacePath, location.search, location.hash, rrNavigate])

    if (legacyRawPath) {
        return <RouteSurfaceFallback label="Loading the node editor" detail="" />
    }

    if (isBareHomeSpacePath) {
        return <RouteSurfaceFallback label="Loading" detail="" />
    }

    // `/chat` — the studio's room, and `/{space}/chat` for anybody else's.
    //
    // Claimed here, with the other lane words, because the generic
    // /{space}/{projectSlug} rule further down would otherwise read "chat" as
    // the name of a project. The transport underneath is the space chat that
    // has existed since spaceChatStore.js: persisted, replayed on join,
    // admin-erasable. What is new is only the address — until now the room
    // could only be reached by loading an authoring surface and opening a
    // panel inside it.
    //
    // Behind the gate on the space, like the lanes, because the socket refuses a
    // line from outside that scope anyway (`canAccessSpace` → `space-forbidden`).
    // Without the gate a guest — scoped to `open` and their own sandbox, never
    // to the studio's room — got the room drawn in full with one red line in the
    // header, which reads as a broken chat rather than as somebody else's door.
    // The gate's own words are the editor's, so the room says its own.
    // `/login` is a place, not a mistyped space. See SignInSurface.
    if (isSignInPath(location)) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <SignInSurface />
            </Suspense>
        )
    }

    if (chatState.isChat) {
        // The list and a private conversation are BOTH at /chat, and neither
        // belongs to one space — the list draws whatever rooms this account
        // reaches, and a private conversation has no space at all. Scoping
        // either of them to `main` would shut somebody out of their own
        // conversations for not being in the studio's room.
        if (chatState.isHome) {
            return (
                <ProtectedSurface
                    showAccountButton={false}
                    outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
                >
                    <Suspense fallback={<RouteSurfaceFallback label="Loading your chats" detail="" />}>
                        {privateChatWith
                            ? (
                                <PrivateChatSurface
                                    withUserId={privateChatWith}
                                    withName={new URLSearchParams(location.search).get('who')}
                                />
                            )
                            : <ChatHomeSurface />}
                    </Suspense>
                </ProtectedSurface>
            )
        }
        return (
            <ProtectedSurface
                requiredSpaceId={chatState.spaceId}
                showAccountButton={false}
                outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
                outOfScopeMessage={`This room belongs to “${chatState.spaceId}”. Sign in with an account that is in it to read what was said and to say anything.`}
            >
                <Suspense fallback={<RouteSurfaceFallback label="Loading the chat" detail="" />}>
                    <StudioChatSurface spaceId={chatState.spaceId} />
                </Suspense>
            </ProtectedSurface>
        )
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

    // `/{space}/patch/{projectId}` — the rig's patch sheet (src/rigbuild/): what the
    // light engineers are handed. Read-only and printable. No gate of its own: it
    // reads the document through the API with the visitor's own session, so the
    // server decides who may read it (a private space answers 401 and the page
    // says so), and a link handed to a crew opens like any public page.
    if (isPatchSheetLocation(patchSheetState)) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <PatchSheetSurface spaceId={patchSheetState.spaceId} projectId={patchSheetState.projectId} />
            </Suspense>
        )
    }

    // `/{space}/touch/{projectId}` is the desk's Touch tab, not a page here: forward to it
    // (src/rigbuild/touchRouting.js) instead of letting the generic rules draw the plain room.
    if (isTouchLocation(touchState)) {
        return <TouchForward to={touchDeskPath(touchState.spaceId, touchState.projectId)} />
    }

    // `/{space}/visualise/{projectId}` — the visualiser (src/rigbuild/, RIG_BUILD.md §18):
    // the light desk and the room side by side, the room drawn from the desk's DMX. No
    // gate of its own, like the patch sheet: both sides are the real pages, framed, and
    // each enforces its own rules (the desk is local-only; the room is /{space}/p/{id}).
    if (isVisualiseLocation(visualiseState)) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <VisualiserSurface spaceId={visualiseState.spaceId} projectId={visualiseState.projectId} />
            </Suspense>
        )
    }

    // `/{space}/plot/{projectId}` — the lighting plot, view B (src/rigbuild/): the rig
    // drawn from above, the room beside it. Members edit it behind the same gate as
    // Perform (it writes the same document through the same op layer as the Studio);
    // anyone else on a PUBLIC space reads it (RigToolRoute, rigToolAccess.js).
    if (isPlotLocation(plotState)) {
        return <RigToolRoute spaceId={plotState.spaceId} surface={(readOnly) => <PlotSurface spaceId={plotState.spaceId} projectId={plotState.projectId} readOnly={readOnly} />} />
    }

    // `/{space}/cards/{projectId}` — the cards, view C (src/rigbuild/): the rental list
    // dealt onto named positions, the patch beside them, the looks on the cue list.
    // Members edit it, a visitor to a public space reads it — the plot's rule (RigToolRoute).
    if (isCardsLocation(cardsState)) {
        return <RigToolRoute spaceId={cardsState.spaceId} surface={(readOnly) => <CardsSurface spaceId={cardsState.spaceId} projectId={cardsState.projectId} readOnly={readOnly} />} />
    }

    // `/{space}/scenes/{projectId}` — the scene deck (src/rigbuild/, RIG_BUILD.md §22): A the
    // scene tiles and their four controls, B the loop as a timeline, sync by a carried file.
    // Members edit it, a visitor to a public space reads it — the plot's rule (RigToolRoute).
    if (isScenesLocation(scenesState)) {
        return <RigToolRoute spaceId={scenesState.spaceId} surface={(readOnly) => <ScenesSurface spaceId={scenesState.spaceId} projectId={scenesState.projectId} readOnly={readOnly} />} />
    }

    // `/{space}/show/{project}` — the show page (src/rigbuild/ShowSurface.jsx, RIG_BUILD.md §24):
    // the live cue and the cue list as cards, for everyone in the space; who may CHOOSE is
    // the server's answer (serverXR/src/routes/showRoutes.js), never this route's. No gate
    // here: the page asks the server, and a private show answers 401/403 there, which the page
    // says in one sentence. (RigToolRoute is not used on purpose: on a `di up --guests`
    // install it reads `session.local` as "everyone edits" and handed a guest the sign-in card.)
    if (isShowLocation(showState)) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading the show" detail="" />}>
                <ShowSurface spaceId={showState.spaceId} projectId={showState.projectId} />
            </Suspense>
        )
    }

    // `/{space}/equipment/{projectId}` — the show's equipment list (src/rigbuild/): the
    // inventory of devices with their item cards, take or skip, and the order with its cost.
    // Members edit it, a visitor to a public space reads it — the plot's rule (RigToolRoute).
    if (isEquipmentLocation(equipmentState)) {
        return <RigToolRoute spaceId={equipmentState.spaceId} surface={(readOnly) => <EquipmentSurface spaceId={equipmentState.spaceId} projectId={equipmentState.projectId} readOnly={readOnly} />} />
    }

    // `/{space}/build/{projectId}` — view A (src/rigbuild/): the room in first person,
    // the rig built in it by hand. Members build behind the gate; a visitor to a public
    // space is handed the crew view (RigToolRoute). `/{space}/crew/{projectId}` is the same room read-only for
    // the light engineers, with no gate of its own — like the patch sheet, it reads
    // the document with the visitor's own session and the server decides.
    if (isBuildLocation(buildState)) {
        if (buildState.crew) {
            return (
                <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                    <BuildSurface spaceId={buildState.spaceId} projectId={buildState.projectId} crew />
                </Suspense>
            )
        }
        // A visitor who may not build is handed the same room as the crew view.
        return <RigToolRoute spaceId={buildState.spaceId} surface={(readOnly) => <BuildSurface spaceId={buildState.spaceId} projectId={buildState.projectId} crew={readOnly} />} />
    }

    // `/{space}/perform/{projectId}[?preset=]` — the Perform line (src/perform/):
    // the show run with only the windows the job needs. Claimed here with the
    // other lane words for the same reason as Projection — the shape is exact
    // and the generic /{space}/{projectSlug} rule would read "perform" as a
    // project — and behind the same gate, because it writes the same document
    // through the same op layer as Nodes.
    if (isPerformLocation(performState)) {
        return (
            <ProtectedSurface
                requiredSpaceId={performState.spaceId}
                outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
            >
                <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                    <PerformApp
                        spaceId={performState.spaceId}
                        projectId={performState.projectId}
                        preset={performState.preset}
                        from={performState.from}
                    />
                </Suspense>
            </ProtectedSurface>
        )
    }

    // `/{space}/scan` — the phone collecting a place (src/scan/ScanSurface.jsx).
    // Dispatched here with the other lane words, and behind the same gate, for
    // the same two reasons: the shape is exact and the generic
    // /{space}/{projectSlug} rule further down would read "scan" as a project;
    // and the page WRITES — every capture is an op on the space's own footage
    // room, so a camera that could be opened on terms the document would refuse
    // is a camera pointed into somebody else's space.
    //
    // No account chip: the whole page is a picture with a record button on it,
    // and a floating button lands on the readings.
    if (appState.page === APP_PAGE_SCAN && appState.spaceId) {
        return (
            <ProtectedSurface
                requiredSpaceId={appState.spaceId}
                outOfScopeBehavior={OUT_OF_SCOPE_EXPLAIN}
                showAccountButton={false}
            >
                <Suspense fallback={<RouteSurfaceFallback label="Opening the camera" detail="" />}>
                    <ScanSurface spaceId={appState.spaceId} />
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

    // Before Studio's own dispatch: /{space}/projects is the space's contents,
    // not a tool's hub. Studio no longer parses that shape (studioRouting.js),
    // but the order is written down here too — the address belongs to the level
    // that owns the things in it.
    if (appState.page === APP_PAGE_SPACE_CONTENTS && appState.spaceId) {
        return <SpaceContentsRoute spaceId={appState.spaceId} />
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
    // `/tools` — the Kit (src/kit/KitPage.jsx): every tool, seen, tried and
    // read. A plain top-level page like the wiki, and open on the same terms —
    // it names doors, it opens no space.
    if (appState.page === APP_PAGE_TOOLS) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <KitPage isLocalInstall={localInstall.isLocal} />
            </Suspense>
        )
    }

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

    // `/for-apps` — the door sign for programs, a plain page like /terms.
    if (appState.page === APP_PAGE_FOR_APPS) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Loading" detail="" />}>
                <ForAppsPage />
            </Suspense>
        )
    }

    // `/shoot/{key}` — a crew's shared shoot sheet, opened by its link.
    if (appState.page === APP_PAGE_SHOOT) {
        return (
            <Suspense fallback={<RouteSurfaceFallback label="Opening the shoot sheet" detail="" />}>
                <ShootPage sheetKey={appState.shootKey} />
            </Suspense>
        )
    }

    const isRootLanding = !appState.spaceId
        && appState.page !== APP_PAGE_PREFERENCES
        && appState.page !== APP_PAGE_WIKI
        && appState.page !== APP_PAGE_PRIVACY
        && appState.page !== APP_PAGE_TERMS
        && appState.page !== APP_PAGE_TOOLS
        && appState.page !== APP_PAGE_FOR_APPS
        && appState.page !== APP_PAGE_SHOOT

    if (isRootLanding) {
        // ?tour=1 keeps the landing reachable on a local install, where `/` is
        // the owner's own home; ?room=1 opens the room bare, without the door.
        const rootQuery = new URLSearchParams(location.search)
        const wantsTour = rootQuery.get('tour') === '1'
        const wantsRoom = rootQuery.get('room') === '1'
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
        // The front door is the room — and the landing IS the front door.
        // #283 made `/` open `main` directly, on the grounds that the landing
        // was only a picture of the room. It is no longer a picture of it:
        // every element on this page now stands in that room, at its own
        // depth, and "Step inside" flies the camera off the flat view instead
        // of navigating (src/landing/enterFlight.js). So `/` is the landing
        // again, and the room it opens onto is the same one, reached without
        // a page load. `?room=1` still opens the room bare, for anyone who
        // wants the space and not the door.
        if (wantsRoom) {
            return <SpaceSurfaceRoute appState={{ page: appState.page, spaceId: PLATFORM_HOME_SPACE_ID }} />
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

    // Last, after every lane router has declined: a bare reserved word is not a
    // space id and must not be looked up as one. `/raw`, `/studio` and
    // `/spaces` returned above; what reaches here is `/make`, `/light`,
    // `/projects` — words the platform reserved so no space could take them,
    // which is why asking the server for a space by that name can only 404 and
    // why the answer it produced ("check the spelling") was advice for a
    // problem nobody had.
    if (bareReserved && hasReservedAddressCard(bareReserved)) {
        // `/light` on a local install never reaches the SPA at all — serverXR
        // serves the desk itself, before index.html. Only a client-side
        // navigation can land here, and on that machine the desk does exist,
        // so hand the address back to the server rather than explain it away.
        if (bareReserved === 'light' && localInstall.isLocal) {
            return <LocalLightingDeskHandoff />
        }
        if (bareReserved === 'light' && !localInstall.resolved) {
            return <RouteSurfaceFallback label="Loading" detail="" />
        }
        return <ReservedAddressCard word={bareReserved} />
    }

    return <SpaceSurfaceRoute appState={appState} />
}

export default function RootApp() {
    return (
        <BrowserRouter>
            <AuthReturnNotice />
            <ModeMark />
            <TreeChip />
            <AppRouter />
        </BrowserRouter>
    )
}
