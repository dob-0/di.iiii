import { useEffect, useMemo, useRef } from 'react'
import { TOP_PICTURE_HEIGHT, TOP_PICTURE_WIDTH } from '../../utils/cardGeometry.js'
import { canPreview, registerCardPreview } from './cardPreviewHub.js'
import { resolveCardPreview } from './resolvePreview.js'
import './cardPreview.css'

// The live picture on the card of a node that makes something visible — the
// cube itself, turning slowly, in its real size and colour. Like TopThumbnail
// it draws nothing itself: it hands its 2D canvas to the ONE shared renderer
// (cardPreviewHub), which renders this node offscreen and copies the frame in.
// A card zoomed out of the port tier unmounts this and costs nothing.

// Build task 1's <=10 Hz cap applies here too: `readOutput` (when the
// editor's clock is running) changes identity every animation frame, and
// resolving the whole preview on every one of those for every previewed
// card is exactly the per-frame cost this file's live-value path must not
// add. A ref plus its own throttled rAF loop reads through it at a fixed
// rate instead of on React's own render cadence.
const LIVE_RESOLVE_INTERVAL_MS = 100
const requestFrame = (callback) => (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : setTimeout(callback, 16))
const cancelFrame = (handle) => (typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame(handle)
    : clearTimeout(handle))

export default function CardPreview({ node, nodes, edges, top, readOutput }) {
    const canvasRef = useRef(null)
    const handleRef = useRef(null)
    const readOutputRef = useRef(readOutput)
    useEffect(() => { readOutputRef.current = readOutput })

    // The STILL baseline: recomputed only when the document itself changes,
    // exactly as before `readOutput` existed — so a document edit is seen
    // immediately rather than waiting on the live loop's next tick.
    const staticResolved = useMemo(
        () => resolveCardPreview(node, { nodes, edges }),
        [node, nodes, edges]
    )

    useEffect(() => {
        const context = canPreview() ? canvasRef.current?.getContext('2d') : null
        const handle = registerCardPreview(context)
        handleRef.current = handle
        return () => {
            handle?.unregister()
            if (handleRef.current === handle) handleRef.current = null
        }
    }, [])

    // Declared after registration, so on mount the handle already exists. The
    // scheduler compares fingerprints itself; this only forwards.
    useEffect(() => {
        handleRef.current?.update(staticResolved)
    }, [staticResolved])

    // The LIVE overlay — a wired colour/size/position reads the SAME real
    // clock and liveOutputs the room draws with (build task 2). Restarts
    // only when the document changes, never on the clock's own tick.
    useEffect(() => {
        let frame = null
        let lastAt = -Infinity
        let stopped = false
        const tick = () => {
            if (stopped) return
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
            if (typeof readOutputRef.current === 'function' && now - lastAt >= LIVE_RESOLVE_INTERVAL_MS) {
                lastAt = now
                const live = resolveCardPreview(node, { nodes, edges, readOutput: readOutputRef.current })
                if (live) handleRef.current?.update(live)
            }
            frame = requestFrame(tick)
        }
        frame = requestFrame(tick)
        return () => {
            stopped = true
            if (frame !== null) cancelFrame(frame)
        }
    }, [node, nodes, edges])

    return (
        <canvas
            ref={canvasRef}
            className="raw-card-preview"
            width={TOP_PICTURE_WIDTH}
            height={TOP_PICTURE_HEIGHT}
            style={{ top }}
            data-preview-kind={staticResolved?.payload?.kind || undefined}
            aria-hidden="true"
        />
    )
}
