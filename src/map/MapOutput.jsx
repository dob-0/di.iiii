import { useEffect, useMemo, useState } from 'react'
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
        </div>
    )
}
