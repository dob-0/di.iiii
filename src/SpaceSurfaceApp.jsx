import { Suspense, useEffect, useState } from 'react'
import { getServerSpace, supportsServerSpaces } from './services/serverSpaces.js'
import { APP_PAGE_PREFERENCES } from './utils/spaceRouting.js'
import lazyWithReload from './utils/lazyWithReload.js'
import LoadingScreen from './components/LoadingScreen.jsx'
import useDocumentTitle from './hooks/useDocumentTitle.js'
import { isPreviewRequest } from './utils/previewMode.js'
import { spaceAddressOf } from './utils/spaceAddress.js'
import { spaceTabTitle, spaceWordFor } from './utils/oneNamePerSpace.js'
import { listSpaceContents } from './project/services/projectsApi.js'

const App = lazyWithReload(() => import('./App.jsx'), 'app')
const BlankNodeWorkspaceApp = lazyWithReload(() => import('./raw/BlankNodeWorkspaceApp.jsx'), 'raw-workspace')
const EmptySpaceView = lazyWithReload(() => import('./components/EmptySpaceView.jsx'), 'empty-space-view')
const SpaceContentsPage = lazyWithReload(() => import('./pages/SpaceContentsPage.jsx'), 'space-contents-page')
const PublicProjectViewer = lazyWithReload(() => import('./project/components/PublicProjectViewer.jsx'), 'public-project-viewer')

const DEFAULT_SPACE_ID = 'main'
const SPACE_META_REFRESH_MS = 2000

export default function SpaceSurfaceApp({ routeState }) {
    const page = routeState?.page || null
    const hasExplicitSpaceId = Boolean(routeState?.spaceId)
    const spaceId = routeState?.spaceId || DEFAULT_SPACE_ID
    const isLocalRootWorkspace = page !== APP_PAGE_PREFERENCES && !hasExplicitSpaceId
    const shouldResolvePublishedSurface = !isLocalRootWorkspace && page !== APP_PAGE_PREFERENCES && supportsServerSpaces && Boolean(spaceId)
    const [surfaceState, setSurfaceState] = useState({
        status: 'idle',
        space: null
    })

    useEffect(() => {
        let cancelled = false
        let refreshTimer = null

        if (!shouldResolvePublishedSurface) {
            setSurfaceState({
                status: 'disabled',
                space: null
            })
            return () => {
                cancelled = true
            }
        }

        const loadSpace = async ({ preserveCurrent = false } = {}) => {
            try {
                const space = await getServerSpace(spaceId)
                if (cancelled) return
                setSurfaceState({
                    status: 'ready',
                    space
                })
            } catch {
                if (cancelled) return
                setSurfaceState((current) => {
                    if (preserveCurrent && current.space?.id === spaceId) {
                        return {
                            status: 'error',
                            space: current.space
                        }
                    }
                    return {
                        status: 'error',
                        space: null
                    }
                })
            }
        }

        setSurfaceState((current) => ({
            status: 'loading',
            space: current.space?.id === spaceId ? current.space : null
        }))

        void loadSpace()
        // A thumbnail reads the space once. The poll exists so an open live
        // surface notices a newly published project; a grid of twelve cards
        // each polling every two seconds is twelve extra requests a second
        // fighting the same six-connection pool the cards need to boot at all.
        if (!isPreviewRequest()) {
            refreshTimer = window.setInterval(() => {
                void loadSpace({ preserveCurrent: true })
            }, SPACE_META_REFRESH_MS)
        }

        return () => {
            cancelled = true
            if (refreshTimer) {
                window.clearInterval(refreshTimer)
            }
        }
    }, [spaceId, shouldResolvePublishedSurface])

    const publishedProjectId = surfaceState.space?.publishedProjectId || null
    const routeProjectId = routeState?.projectId || null
    // A space with no front door is not a scene: it opens what it holds (its only project, its list of projects, or
    // a plain empty-space view). Only asked when nothing else decides, and only once the space itself has answered.
    const needsContents = shouldResolvePublishedSurface && Boolean(surfaceState.space)
        && !publishedProjectId && !routeProjectId
    const [contents, setContents] = useState({ spaceId: null, projects: null })
    useEffect(() => {
        if (!needsContents) return undefined
        let cancelled = false
        listSpaceContents(spaceId)
            .then((projects) => { if (!cancelled) setContents({ spaceId, projects: Array.isArray(projects) ? projects : [] }) })
            .catch(() => { if (!cancelled) setContents({ spaceId, projects: undefined }) })
        return () => { cancelled = true }
    }, [needsContents, spaceId])
    const contentsKnown = needsContents && contents.spaceId === spaceId && Array.isArray(contents.projects)
    // One name per space (docs/ai/vocabulary.md): what the viewer's bar, heading and tab say is the space's name, its address
    // when nobody named it, whichever address was typed (utils/oneNamePerSpace.js).
    const spaceAddress = spaceAddressOf(surfaceState.space, spaceId)
    const spaceLabel = spaceWordFor(surfaceState.space?.label, spaceAddress)

    // The naming rule (docs/ai/vocabulary.md): a space's own name is what a visitor sees for it — tab included. The
    // platform's own space (id main, named "Home" in data) gets no title here: the front door keeps index.html's title (the
    // same `own` check ogRoutes.js carries for the link-preview card). Asked of the space's record, not of the word
    // that was typed: /di-iiii is the same space as /main. Only set here for the bare <App/> surface below; both
    // PublicProjectViewer branches set their own title once they know whether they are showing a project too.
    useDocumentTitle(
        shouldResolvePublishedSurface
            && !routeProjectId && !publishedProjectId && page !== APP_PAGE_PREFERENCES
            && surfaceState.status === 'ready'
            ? spaceTabTitle({ spaceId: surfaceState.space?.id || spaceId, label: surfaceState.space?.label, address: spaceAddress })
            : null
    )

    if (isLocalRootWorkspace) {
        return (
            <Suspense fallback={<LoadingScreen label="Loading the node editor" />}>
                <BlankNodeWorkspaceApp spaceId={spaceId} />
            </Suspense>
        )
    }

    if (shouldResolvePublishedSurface && (surfaceState.status === 'idle' || surfaceState.status === 'loading')) {
        return <LoadingScreen label="Loading space" />
    }

    // direct project link (/:space/p/:projectId) — the one-pager viewer for any
    // project of the space, not just the published one; auth is still enforced
    // upstream by SpaceSurfaceRoute for non-public spaces. No showProjectSwitcher:
    // owner call 2026-08-07 — the floating chip clashed with published page
    // designs, so every public face stays chrome-free; project hopping lives in
    // the Studio Projects window.
    if (shouldResolvePublishedSurface && routeProjectId) {
        return (
            <Suspense fallback={<LoadingScreen label="Loading project" />}>
                <PublicProjectViewer
                    key={`${spaceId}:${routeProjectId}`}
                    spaceId={spaceId}
                    projectId={routeProjectId}
                    spaceLabel={spaceLabel}
                    spaceAddress={spaceAddress}
                    spaceRecordId={surfaceState.space?.id}
                    // The URL itself names this project (/{space}/p/{project} or
                    // its vanity-slug form) — the naming rule's "inside a
                    // project" case. The bare-space branch below is the other
                    // one: a project happening to be published as the space's
                    // own front page, which stays named after the SPACE.
                    showProjectInTitle
                />
            </Suspense>
        )
    }

    if (shouldResolvePublishedSurface && publishedProjectId) {
        return (
            <Suspense fallback={<LoadingScreen label="Loading space" />}>
                <PublicProjectViewer
                    key={`${spaceId}:${publishedProjectId}`}
                    spaceId={spaceId}
                    projectId={publishedProjectId}
                    spaceLabel={spaceLabel}
                    spaceAddress={spaceAddress}
                    spaceRecordId={surfaceState.space?.id}
                />
            </Suspense>
        )
    }

    if (page === APP_PAGE_PREFERENCES) {
        return <Suspense fallback={<LoadingScreen label="Loading the admin console" />}><App /></Suspense>
    }

    if (needsContents && contents.spaceId !== spaceId) {
        return <LoadingScreen label="Loading space" />
    }

    if (contentsKnown) {
        const projects = contents.projects
        if (projects.length === 1) {
            return (
                <Suspense fallback={<LoadingScreen label="Loading space" />}>
                    <PublicProjectViewer
                        key={`${spaceId}:${projects[0].id}`}
                        spaceId={spaceId}
                        projectId={projects[0].id}
                        spaceLabel={spaceLabel}
                        spaceAddress={spaceAddress}
                        spaceRecordId={surfaceState.space?.id}
                    />
                </Suspense>
            )
        }
        if (projects.length > 1) {
            return <Suspense fallback={<LoadingScreen label="Loading space" />}><SpaceContentsPage spaceId={spaceId} /></Suspense>
        }
        return <Suspense fallback={<LoadingScreen label="Loading space" />}><EmptySpaceView spaceId={spaceId} title={spaceLabel} /></Suspense>
    }

    return <Suspense fallback={<LoadingScreen label="Loading space" />}><App /></Suspense>
}
