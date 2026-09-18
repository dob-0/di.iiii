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
export default function CardPreview({ node, nodes, edges, top }) {
    const canvasRef = useRef(null)
    const handleRef = useRef(null)
    // Keyed on identities that only change when the document does — a pan or
    // a zoom re-renders the surface but not this.
    const resolved = useMemo(() => resolveCardPreview(node, { nodes, edges }), [node, nodes, edges])

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
        handleRef.current?.update(resolved)
    }, [resolved])

    return (
        <canvas
            ref={canvasRef}
            className="raw-card-preview"
            width={TOP_PICTURE_WIDTH}
            height={TOP_PICTURE_HEIGHT}
            style={{ top }}
            data-preview-kind={resolved?.payload?.kind || undefined}
            aria-hidden="true"
        />
    )
}
