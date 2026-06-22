import { Suspense, useEffect, useState } from 'react'
import LiveProjectScene from './LiveProjectScene.jsx'
import { listServerSpaces } from '../services/serverSpaces.js'

const PREFERRED_SPACE_ID = 'main'

export default function GridFloorBackground({
    opacity = 1,
    interactive = false,
    showNodes = true,
    overlayGradient = 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.35) 100%), linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)',
    className = ''
}) {
    const isTestEnv = typeof window !== 'undefined' && !window.ResizeObserver
    // No project until we confirm one is actually public -- a direct
    // getServerSpace('main') 401s for an anonymous visitor whenever "main"
    // isn't marked public (true on production), and guessing a fallback
    // project id that may not exist on this environment just trades that
    // 401 for a 404. listServerSpaces() is already filtered server-side to
    // public-only spaces for anonymous callers, so anything in it is safe.
    const [projectId, setProjectId] = useState(null)

    useEffect(() => {
        listServerSpaces()
            .then(spaces => {
                const withProject = spaces.filter(s => s.publishedProjectId)
                if (!withProject.length) return
                const preferred = withProject.find(s => s.id === PREFERRED_SPACE_ID)
                setProjectId((preferred || withProject[0]).publishedProjectId)
            })
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
