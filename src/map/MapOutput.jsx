import { useCallback, useEffect, useMemo, useState } from 'react'
import MapStage from './MapStage.jsx'
import { useMapDocument, useMapChannelListener } from './useMapDocument.js'
import './mapSurface.css'

// THE SIGNAL.
//
// Nothing on this page but the surfaces. No chrome, no title, no cursor once
// it has been still for a moment, and a background that is actually black —
// because on a projector every non-black pixel is light thrown at a wall
// somebody is standing in front of.
//
// It renders through the same MapStage the desk previews with, at the window's
// own size, so what was aligned is what projects.
const IDLE_CURSOR_MS = 2000

export default function MapOutput({ projectId, spaceId }) {
    const { store, mapping } = useMapDocument(projectId, { role: 'out' })
    useMapChannelListener(projectId, store)

    const [viewport, setViewport] = useState(() => ({
        width: typeof window === 'undefined' ? 0 : window.innerWidth,
        height: typeof window === 'undefined' ? 0 : window.innerHeight
    }))
    const [idle, setIdle] = useState(false)

    useEffect(() => {
        const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
        window.addEventListener('resize', onResize)
        onResize()
        return () => window.removeEventListener('resize', onResize)
    }, [])

    useEffect(() => {
        let timer = null
        const wake = () => {
            setIdle(false)
            clearTimeout(timer)
            timer = setTimeout(() => setIdle(true), IDLE_CURSOR_MS)
        }
        wake()
        window.addEventListener('pointermove', wake)
        return () => {
            clearTimeout(timer)
            window.removeEventListener('pointermove', wake)
        }
    }, [])

    // The output frame fills the window and keeps the mapping's aspect. A
    // projector running 16:9 and a browser window that is not 16:9 would
    // otherwise stretch every surface — the one error in a mapping chain that
    // looks like a bad alignment and is not.
    const stage = useMemo(() => {
        const aspect = (mapping?.output?.width || 16) / (mapping?.output?.height || 9)
        if (!(viewport.width > 0) || !(viewport.height > 0)) return { width: 0, height: 0 }
        const width = Math.min(viewport.width, viewport.height * aspect)
        return { width: Math.round(width), height: Math.round(width / aspect) }
    }, [viewport, mapping])

    return (
        <div className={`map-output${idle ? ' is-idle' : ''}`}>
            {stage.width > 0 ? (
                <MapStage mapping={mapping} spaceId={spaceId} width={stage.width} height={stage.height} live />
            ) : null}
            <MapOutputControls />
        </div>
    )
}

// The only chrome the signal carries, and it hides itself the moment the
// pointer stops. Everything here is one problem: getting this window onto the
// projector and filling it, which is otherwise a drag and an F11 in the dark.
function MapOutputControls() {
    const [screens, setScreens] = useState([])
    const [full, setFull] = useState(false)

    useEffect(() => {
        const onChange = () => setFull(Boolean(document.fullscreenElement))
        document.addEventListener('fullscreenchange', onChange)
        onChange()
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    const listScreens = useCallback(async () => {
        // The Window Management API is Chromium-only and asks permission the
        // first time. Everywhere else this stays an empty list and the plain
        // fullscreen button is all there is — which still works.
        if (typeof window === 'undefined' || !window.getScreenDetails) return
        try {
            const details = await window.getScreenDetails()
            setScreens(details.screens || [])
            details.addEventListener?.('screenschange', () => setScreens(details.screens || []))
        } catch {
            setScreens([])
        }
    }, [])

    useEffect(() => { listScreens() }, [listScreens])

    const goFullscreen = useCallback(async (screen = null) => {
        const element = document.documentElement
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen()
                return
            }
            // Moving the window first and THEN going fullscreen is the order
            // that works: a fullscreen request names no display, it fills
            // whichever one the window is already on.
            if (screen && window.moveTo) {
                window.moveTo(screen.availLeft, screen.availTop)
                window.resizeTo(screen.availWidth, screen.availHeight)
            }
            await element.requestFullscreen({ navigationUI: 'hide' })
        } catch {
            /* refused — the button simply does nothing rather than throwing
               an overlay across the projector */
        }
    }, [])

    return (
        <div className="map-output-controls">
            <button type="button" onClick={() => goFullscreen()}>{full ? 'Exit full screen' : 'Full screen'}</button>
            {screens.length > 1 ? screens.map((screen, index) => (
                <button
                    key={screen.label || index}
                    type="button"
                    onClick={() => goFullscreen(screen)}
                    title={`${screen.width}x${screen.height}${screen.isPrimary ? ' (primary)' : ''}`}
                >
                    {screen.label || `Display ${index + 1}`}
                </button>
            )) : null}
        </div>
    )
}
