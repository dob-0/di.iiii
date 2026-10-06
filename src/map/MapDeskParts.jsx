import { useEffect, useMemo, useRef, useState } from 'react'
import MapStage from './MapStage.jsx'
import MapEditorOverlay from './MapEditorOverlay.jsx'
import { describeMachine, unresolvedInputs } from './mapMachines.js'
import { ndiScanLine } from './ndiLink.js'

// The Projection desk's panes as parts that stand on their own, so the same
// pane can be a column of the desk (MapSurface.jsx) or a window of its own on
// the Perform desk (src/perform/PerformWindows.jsx). Moved here WITHOUT a
// change to their markup or classes: the desk looks exactly as it did.

// Sized so five of them tile a 16:9 output without overlapping — a new surface
// lands somewhere visible rather than exactly on top of the last one.
export const nextCorners = (index) => {
    const column = index % 3
    const row = Math.floor(index / 3) % 2
    const x = 0.06 + (column * 0.31)
    const y = 0.08 + (row * 0.45)
    return [[x, y], [x + 0.26, y], [x + 0.26, y + 0.38], [x, y + 0.38]]
}

export const useMeasuredStage = (aspect) => {
    const frameRef = useRef(null)
    const [box, setBox] = useState({ width: 0, height: 0 })

    useEffect(() => {
        const frame = frameRef.current
        if (!frame || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            setBox({ width, height })
        })
        observer.observe(frame)
        return () => observer.disconnect()
    }, [])

    // Letterbox to the output's aspect. The preview must be the same SHAPE as
    // the signal or a corner aligned here would not be the corner projected.
    return {
        frameRef,
        stage: useMemo(() => {
            if (!(box.width > 0) || !(box.height > 0) || !(aspect > 0)) return { width: 0, height: 0 }
            const width = Math.min(box.width, box.height * aspect)
            return { width: Math.round(width), height: Math.round(width / aspect) }
        }, [box, aspect])
    }
}

export function MapSurfaceList({ surfaces, selectedId, soloId, onSelect, onAdd, onToggle, onSolo, onFront }) {
    return (
        <>
            <div className="map-panel-head">
                <h2>Surfaces</h2>
                <button type="button" className="map-action" onClick={onAdd}>Add</button>
            </div>
            <ul className="map-surface-list">
                {surfaces.map((surface, index) => (
                    <li key={surface.id} className={`map-surface-row${surface.id === selectedId ? ' is-selected' : ''}`}>
                        <button type="button" className="map-surface-name" onClick={() => onSelect(surface.id)}>
                            {surface.name || surface.id}
                            <span className="map-surface-kind">{surface.source.kind}</span>
                        </button>
                        <div className="map-surface-row-actions">
                            <button type="button" className={`map-mini${surface.enabled ? '' : ' is-off'}`}
                                title="Show or hide on the wall"
                                onClick={() => onToggle(surface)}>
                                {surface.enabled ? 'On' : 'Off'}
                            </button>
                            <button type="button" className={`map-mini${soloId === surface.id ? ' is-on' : ''}`}
                                title="Show this one alone on this screen. The projector still shows every surface."
                                onClick={() => onSolo(soloId === surface.id ? null : surface.id)}>Solo · screen</button>
                            <button type="button" className="map-mini" title="Later in the paint order"
                                onClick={() => onFront(surface.id)} disabled={index === surfaces.length - 1}>Front</button>
                        </div>
                    </li>
                ))}
            </ul>
            {!surfaces.length ? (
                <p className="map-empty">No surfaces yet. Add one for each shape on the wall, then drag its corners onto that shape.</p>
            ) : null}
        </>
    )
}

export function MapMachinesList({ machines, ndiScan, surfaces }) {
    return (
        <div className="map-section">
            <div className="map-panel-head"><h2>Machines</h2></div>
            {machines.length ? machines.map(describeMachine).map((entry) => (
                <p key={entry.id} className="map-machine">
                    <strong>{entry.name}</strong>
                    <span>{[
                        entry.screens.length ? entry.screens.join(' + ') : null,
                        entry.inputs.length ? `inputs: ${entry.inputs.join(', ')}` : 'no inputs named yet',
                        // Only when there are some: most machines
                        // have no NDI runtime, and a permanent
                        // "no NDI" on every line would teach
                        // nobody anything.
                        entry.ndi.length ? `NDI: ${entry.ndi.join(', ')}` : null
                    ].filter(Boolean).join(' · ')}</span>
                </p>
            )) : <p className="map-empty">Finding the machines showing this space…</p>}
            {machines.length === 1 ? (
                <p className="map-empty">Only this machine so far. Another appears while its output page is open.</p>
            ) : null}
            {/* This machine's own NDI autoscan: a reading, kept current by the
                server — or, where it cannot look, the reason why. */}
            {ndiScanLine(ndiScan) ? (
                <p className="map-empty" role="status">{ndiScanLine(ndiScan)}</p>
            ) : null}
            {unresolvedInputs(surfaces, machines).map((entry) => (
                <p key={entry.id} className="map-machine is-warning" role="status">
                    {entry.kind === 'ndi'
                        ? (entry.input
                            ? `“${entry.name}” wants an NDI source called “${entry.input}” — no machine here can see one.`
                            : `“${entry.name}” is an NDI source with no name given.`)
                        : (entry.input
                            ? `“${entry.name}” wants an input called “${entry.input}” — no machine here has one.`
                            : `“${entry.name}” is a stream with no input named.`)}
                </p>
            ))}
        </div>
    )
}

/**
 * The wall: the stage letterboxed to the output, the surfaces on it, and —
 * unless `editable` is false — the corners to drag. With `editable` false it
 * is the picture only: what the projector shows, as a preview.
 */
export function MapWallView({
    mapping, spaceId, network, assets, projectId, live = false, soloSurfaceId = null,
    editable = true, selectedId = null, maskMode = false, snap = true,
    referenceUrl = '', reference = null,
    onSelectSurface = () => {}, onCornersChange = () => {}, onMaskChange = () => {},
    hint = true
}) {
    const output = mapping?.output || { width: 1920, height: 1080 }
    const { frameRef, stage } = useMeasuredStage(output.width / output.height)
    return (
        <main className="map-frame" ref={frameRef}>
            {stage.width > 0 ? (
                <div className="map-stage-holder" style={{ width: stage.width, height: stage.height }}>
                    <MapStage
                        mapping={mapping}
                        spaceId={spaceId}
                        width={stage.width}
                        height={stage.height}
                        live={live}
                        soloSurfaceId={soloSurfaceId}
                        network={network}
                        assets={assets}
                        projectId={projectId}
                    />
                    {reference?.visible && referenceUrl ? (
                        <img className="map-reference" src={referenceUrl} alt="" style={{ opacity: reference.opacity }} />
                    ) : null}
                    {editable ? (
                        <MapEditorOverlay
                            mapping={mapping}
                            width={stage.width}
                            height={stage.height}
                            selectedSurfaceId={selectedId}
                            maskMode={maskMode}
                            grid={mapping?.grid || 0}
                            snap={snap}
                            onSelectSurface={onSelectSurface}
                            onCornersChange={onCornersChange}
                            onMaskChange={onMaskChange}
                        />
                    ) : null}
                </div>
            ) : null}
            {hint ? (
                <p className="map-hint">
                    {maskMode
                        ? 'Mask: click inside the selected surface to add a point, drag to move it, shift-click to remove. Alt while dragging ignores snapping.'
                        : 'Drag a corner to pin it. Arrow keys nudge, shift for ten. Alt while dragging ignores the grid and the guides. M masks, S snaps, 1-9 fire cues.'}
                </p>
            ) : null}
        </main>
    )
}
