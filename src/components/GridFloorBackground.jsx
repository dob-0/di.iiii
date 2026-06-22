import { Suspense, useEffect, useState } from 'react'
import LiveProjectScene from './LiveProjectScene.jsx'
import { getServerSpace } from '../services/serverSpaces.js'

const BACKGROUND_SPACE_ID = 'main'
// Used only until the live lookup below resolves, or if it fails / no project
// is linked yet -- not the source of truth. The source of truth is whatever
// project is linked to the "main" space via Studio Hub's "Change project".
const FALLBACK_PROJECT_ID = 'test-file-project'

export default function GridFloorBackground({
    opacity = 1,
    interactive = false,
    showNodes = true,
    overlayGradient = 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.35) 100%), linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)',
    className = ''
}) {
    const isTestEnv = typeof window !== 'undefined' && !window.ResizeObserver
    const [projectId, setProjectId] = useState(FALLBACK_PROJECT_ID)

    useEffect(() => {
        getServerSpace(BACKGROUND_SPACE_ID)
            .then(space => { if (space?.publishedProjectId) setProjectId(space.publishedProjectId) })
            .catch(() => {})
    }, [])

    return (
        <div className={`grid-floor-background ${className}`} style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: interactive ? 'auto' : 'none',
            opacity,
        }}>
            {!isTestEnv && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 1,
                    pointerEvents: interactive ? 'auto' : 'none',
                }}>
                    <Suspense fallback={null}>
                        <LiveProjectScene
                            projectId={projectId}
                            interactive={interactive}
                            showChrome={false}
                            showEntities={showNodes}
                        />
                    </Suspense>
                </div>
            )}
            <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                pointerEvents: 'none',
                background: overlayGradient,
            }} />
        </div>
    )
}
