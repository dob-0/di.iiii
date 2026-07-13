import { lazy, Suspense, useEffect, useState } from 'react'
import { getServerSpace, supportsServerSpaces } from './services/serverSpaces.js'
import { APP_PAGE_PREFERENCES } from './utils/spaceRouting.js'

const App = lazy(() => import('./App.jsx'))
const BlankNodeWorkspaceApp = lazy(() => import('./beta/BlankNodeWorkspaceApp.jsx'))
const PublicProjectViewer = lazy(() => import('./project/components/PublicProjectViewer.jsx'))

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

    if (isLocalRootWorkspace) {
        return (
            <Suspense fallback={null}>
                <BlankNodeWorkspaceApp spaceId={spaceId} />
            </Suspense>
        )
    }

    if (shouldResolvePublishedSurface && (surfaceState.status === 'idle' || surfaceState.status === 'loading')) {
        return null
    }

    // direct project link (/:space/p/:projectId) — the one-pager viewer for any
    // project of the space, not just the published one; auth is still enforced
    // upstream by SpaceSurfaceRoute for non-public spaces
    if (shouldResolvePublishedSurface && routeProjectId) {
        return (
            <Suspense fallback={null}>
                <PublicProjectViewer
                    key={`${spaceId}:${routeProjectId}`}
                    spaceId={spaceId}
                    projectId={routeProjectId}
                    spaceLabel={surfaceState.space?.label || spaceId}
                />
            </Suspense>
        )
    }

    if (shouldResolvePublishedSurface && publishedProjectId) {
        return (
            <Suspense fallback={null}>
                <PublicProjectViewer
                    key={`${spaceId}:${publishedProjectId}`}
                    spaceId={spaceId}
                    projectId={publishedProjectId}
                    spaceLabel={surfaceState.space?.label || spaceId}
                />
            </Suspense>
        )
    }

    if (page === APP_PAGE_PREFERENCES) {
        return <Suspense fallback={null}><App /></Suspense>
    }

    return <Suspense fallback={null}><App /></Suspense>
}
