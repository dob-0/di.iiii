import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { entitiesForWall, hasLiveWall, isDrawnScreen, liveWallMounts, readLiveWall, writeLiveWall } from './liveWall.js'

const NO_ENTITIES = Object.freeze([])

// The existing live screens (studio/components/LiveScreens.jsx), loaded only when a room view really mounts them.
const LiveScreens = lazy(() => import('../../studio/components/LiveScreens.jsx'))

// The viewer's switch: one boolean per browser, shared by every room view in it (the storage event keeps two open
// views in step). Never in the document.
export function useLiveWall() {
    const [on, setOn] = useState(() => readLiveWall())
    useEffect(() => {
        const sync = () => setOn(readLiveWall())
        globalThis.addEventListener?.('storage', sync)
        return () => globalThis.removeEventListener?.('storage', sync)
    }, [])
    const set = useCallback((next) => {
        writeLiveWall(next)
        setOn(next)
    }, [])
    return [on, set]
}

// The room view's side of the wall: the entities to draw, the screens' textures, the sources, the switch.
// `document` is the project document, `entities` what the view draws (a look may pose them).
export function useRoomWall(entities) {
    const [on, setOn] = useLiveWall()
    const [screens, setScreens] = useState(null)
    const mounted = liveWallMounts(entities, on)
    // nothing mounted, no textures: the plane would draw a dim plate, so a switched-off wall draws no plane at all
    const drawn = useMemo(() => entitiesForWall(entities || NO_ENTITIES, on), [entities, on])
    useEffect(() => { if (!mounted) setScreens(null) }, [mounted])
    return { on, setOn, screens: mounted ? screens : null, setScreens, mounted, drawn, hasWall: hasLiveWall(entities) }
}

// The sources behind the screens, in a 1px hidden host (a hidden video stops decoding; display:none would freeze the wall).
export function LiveWallSources({ document, entities, mounted, onScreens }) {
    // only the drawn screens: a hidden one (the still mode) must not open a source
    const doc = useMemo(() => (document ? { ...document, entities: (entities || document.entities || []).filter(isDrawnScreen) } : null), [document, entities])
    if (!mounted || !doc) return null
    return (
        <div data-testid="live-wall-sources" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
            <Suspense fallback={null}>
                <LiveScreens document={doc} onScreens={onScreens} />
            </Suspense>
        </div>
    )
}

export function LiveWallSwitch({ on, onChange, hasWall, style = null }) {
    if (!hasWall) return null
    return (
        <button
            type="button"
            data-testid="live-wall-switch"
            aria-pressed={on}
            title={on ? 'Live wall: the wall plays the deck in step with the lights. Off shows the still picture and stops the second picture.' : 'Live wall is off: the still picture shows.'}
            onClick={() => onChange(!on)}
            style={{
                position: 'absolute',
                zIndex: 20,
                padding: 'var(--di-space-1, 4px) var(--di-space-3, 10px)',
                border: '1px solid var(--di-line, rgba(255,255,255,0.28))',
                borderRadius: 0,
                background: 'var(--di-scrim, rgba(0,0,0,0.6))',
                color: on ? 'var(--di-text, #fff)' : 'var(--di-text-muted, rgba(255,255,255,0.5))',
                font: 'inherit',
                fontFamily: 'var(--di-mono, monospace)',
                fontSize: 'var(--di-text-2, 0.625rem)',
                letterSpacing: 'var(--di-label-tracking, 0.16em)',
                textTransform: 'uppercase',
                cursor: 'pointer',
                ...style
            }}
        >
            Live wall
        </button>
    )
}
