import { Suspense, useEffect, useState } from 'react'
import { getServerSpace, supportsServerSpaces } from './services/serverSpaces.js'
import { APP_PAGE_PREFERENCES } from './utils/spaceRouting.js'
import lazyWithReload from './utils/lazyWithReload.js'
import LoadingScreen from './components/LoadingScreen.jsx'

const App = lazyWithReload(() => import('./App.jsx'), 'app')
const BlankNodeWorkspaceApp = lazyWithReload(() => import('./raw/BlankNodeWorkspaceApp.jsx'), 'raw-workspace')
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
        refreshTimer = window.setInterval(() => {
            void loadSpace({ preserveCurrent: true })
        }, SPACE_META_REFRESH_MS)

        return () => {
            cancelled = true
            if (refreshTimer) {
                window.clearInterval(refreshTimer)
            }
        }
    }, [spaceId, shouldResolvePublishedSurface])

    const publishedProjectId = surfaceState.space?.publishedProjectId || null
    const routeProjectId = routeState?.projectId || null
    // The space's real id, whichever of its two addresses the visitor typed —
    // the route above resolves it, and the fetched space is the second witness.
    // Everything below is keyed on identity, not on the name in the bar.
    const canonicalSpaceId = surfaceState.space?.id || spaceId

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
                    key={`${canonicalSpaceId}:${routeProjectId}`}
                    spaceId={canonicalSpaceId}
                    projectId={routeProjectId}
                    spaceLabel={surfaceState.space?.label || canonicalSpaceId}
                />
            </Suspense>
        )
    }

    if (shouldResolvePublishedSurface && publishedProjectId) {
        return (
            <Suspense fallback={<LoadingScreen label="Loading space" />}>
                <PublicProjectViewer
                    key={`${canonicalSpaceId}:${publishedProjectId}`}
                    spaceId={canonicalSpaceId}
                    projectId={publishedProjectId}
                    spaceLabel={surfaceState.space?.label || canonicalSpaceId}
                />
            </Suspense>
        )
    }

    // App reads the URL for itself (useAppRoute), so the resolved id has to be
    // handed to it explicitly — otherwise the editor keys its permissions,
    // socket room and local cache on the segment and a locked space reached by
    // slug reads as editable.
    if (page === APP_PAGE_PREFERENCES) {
        return <Suspense fallback={<LoadingScreen label="Loading the admin console" />}><App spaceId={canonicalSpaceId} /></Suspense>
    }

    return <Suspense fallback={<LoadingScreen label="Loading space" />}><App spaceId={canonicalSpaceId} /></Suspense>
}
