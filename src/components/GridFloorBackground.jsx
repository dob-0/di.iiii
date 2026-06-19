import { Suspense } from 'react'
import LiveProjectScene from './LiveProjectScene.jsx'

// "main"'s published project -- editable in Studio like any other space.
const LANDING_PROJECT_ID = 'test-file-project'

export default function GridFloorBackground({
    opacity = 1,
    interactive = false,
    showNodes = true,
    overlayGradient = 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.35) 100%), linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)',
    className = ''
}) {
    const isTestEnv = typeof window !== 'undefined' && !window.ResizeObserver

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
                            projectId={LANDING_PROJECT_ID}
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
