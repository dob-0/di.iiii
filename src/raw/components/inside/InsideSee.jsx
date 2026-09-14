import { useEffect, useMemo, useRef } from 'react'
import { formatPortValue } from '../../../project/graph/formatPortValue.js'
import { registerTopThumbnail } from '../../../project/tops/topThumbnails.js'
import { setInspectedTop } from '../../../project/tops/topReports.js'
import { canPreview, registerCardPreview } from '../cardPreview/cardPreviewHub.js'
import { resolveCardPreview } from '../cardPreview/resolvePreview.js'
import LiveTextureView, { isLiveTexture } from '../LiveTextureView.jsx'
import InsideScope from './InsideScope.jsx'

// SEE — the node working, chosen by what it makes (insidePreviewKind).
//
// Nothing here renders a second live copy of anything with a side effect: a
// picture operator's full picture comes from the runner through the thumbnail
// registry (the card that used that slot is in the parent scope and unmounted);
// a shape comes from the one shared card-preview renderer; a window's content
// is handed in by the editor, which never mounts that window's floating copy
// while you stand inside it (selectMountedPanelNodes is scoped).

const PICTURE_W = 640
const PICTURE_H = 360

function PictureSee({ node }) {
    const canvasRef = useRef(null)
    useEffect(() => {
        const context = canPreview() ? canvasRef.current?.getContext('2d') : null
        const unregister = registerTopThumbnail(node.id, context)
        // Looking inside an operator that runs on another machine asks that
        // machine for full video instead of thumbnails.
        setInspectedTop(node.id)
        return () => { unregister(); setInspectedTop(null) }
    }, [node.id])
    return <canvas ref={canvasRef} className="raw-inside-see-media" width={PICTURE_W} height={PICTURE_H} role="img" aria-label={`What ${node.label} makes`} />
}

function ShapeSee({ node, allNodes, edges }) {
    const canvasRef = useRef(null)
    const handleRef = useRef(null)
    const resolved = useMemo(() => resolveCardPreview(node, { nodes: allNodes, edges }), [node, allNodes, edges])
    useEffect(() => {
        const context = canPreview() ? canvasRef.current?.getContext('2d') : null
        const handle = registerCardPreview(context)
        handleRef.current = handle
        return () => {
            handle?.unregister()
            if (handleRef.current === handle) handleRef.current = null
        }
    }, [])
    useEffect(() => { handleRef.current?.update(resolved) }, [resolved])
    return <canvas ref={canvasRef} className="raw-inside-see-media" width={PICTURE_W} height={PICTURE_H} role="img" aria-label={`${node.label}, as it stands in the room`} />
}

const Line = ({ children }) => <p className="raw-inside-see-line">{children}</p>

const scopeType = (type) => (type === 'number' || type === 'boolean' || type === 'signal' || type === 'color' || type === 'vec3')

export default function InsideSee({ kind, node, allNodes = [], edges = [], inRows = [], outRows = [], now = 0, renderWindow = null, childCount = 0 }) {
    if (kind === 'unbuilt') {
        return <Line>This node is not built yet. It is here as a set of ports with nothing behind them.</Line>
    }
    if (kind === 'picture') return <PictureSee node={node} />
    if (kind === 'object3d') return <ShapeSee node={node} allNodes={allNodes} edges={edges} />
    if (kind === 'window') {
        // Inside, a window's content has the room of the frame, not a card's
        // (the VJ deck lays its grid out denser for 'inside').
        const content = renderWindow ? renderWindow(node, { placement: 'inside' }) : null
        return content ? <div className="raw-inside-see-window">{content}</div> : <Line>Its window opens here.</Line>
    }
    if (kind === 'texture') {
        const frame = outRows.find((row) => row.type === 'texture')
        return isLiveTexture(frame?.value)
            ? <LiveTextureView texture={frame.value} label={`What ${node.label} brings in`} className="raw-inside-see-media" />
            : <Line>No picture yet{frame?.windowClosed ? ' — the window that makes it is closed.' : '.'}</Line>
    }
    if (kind === 'number' || kind === 'signal' || kind === 'colour' || kind === 'vec3') {
        const series = outRows
            .filter((row) => scopeType(row.type))
            .map((row) => ({ id: row.id, label: row.label, type: row.type, value: row.value }))
        return <InsideScope series={series} now={now} label={`What ${node.label} gives`} />
    }
    if (kind === 'text') {
        const text = outRows.find((row) => row.type === 'string')
        return <p className="raw-inside-see-text">{typeof text?.value === 'string' && text.value ? text.value : 'No words yet.'}</p>
    }
    if (kind === 'device') {
        // What goes out IS what comes in: the inputs' live values.
        return (
            <div className="raw-inside-see-device">
                <Line>Sends out of the browser. Going out now:</Line>
                <ul className="raw-inside-scope-readout">
                    {inRows.filter((row) => row.isPort).map((row) => (
                        <li key={row.id}><span>{row.label}</span><strong>{formatPortValue(row.value, row.type).text}</strong></li>
                    ))}
                </ul>
            </div>
        )
    }
    if (kind === 'holds') {
        return <Line>It holds {childCount} {childCount === 1 ? 'node' : 'nodes'}. They stand on the canvas below.</Line>
    }
    return <Line>Nothing of its own runs. The room reads its settings.</Line>
}
