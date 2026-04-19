import { useEffect, useState } from 'react'
import App from './App.jsx'
import BlankNodeWorkspaceApp from './beta/BlankNodeWorkspaceApp.jsx'
import { getServerSpace, supportsServerSpaces } from './services/serverSpaces.js'
import { APP_PAGE_PREFERENCES } from './utils/spaceRouting.js'
import PublicProjectViewer from './project/components/PublicProjectViewer.jsx'

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

    if (isLocalRootWorkspace) {
        return <BlankNodeWorkspaceApp spaceId={spaceId} />
    }

    if (shouldResolvePublishedSurface && publishedProjectId) {
        return (
            <PublicProjectViewer
                key={`${spaceId}:${publishedProjectId}`}
                spaceId={spaceId}
                projectId={publishedProjectId}
                spaceLabel={surfaceState.space?.label || spaceId}
            />
        )
    }

    if (page === APP_PAGE_PREFERENCES) {
        return <App />
    }

    return <BlankNodeWorkspaceApp spaceId={spaceId} />
}
