import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapStage from './MapStage.jsx'
import MapEditorOverlay from './MapEditorOverlay.jsx'
import MapInspector from './MapInspector.jsx'
import MapCueList from './MapCueList.jsx'
import { useMapDocument } from './useMapDocument.js'
import { buildMapOutputPath } from './mapRouting.js'
import { listProjects } from '../project/services/projectsApi.js'
import { transportWarning } from './transportCeiling.js'
import { lightingDeskPath, probeLightingDesk } from './lightingLink.js'
import './mapSurface.css'

// THE MAPPER'S DESK.
//
// Five children made worlds at a day camp in Dilijan. On the last day those
// worlds have to land on five coloured rectangles of paper taped to a
// container wall, from one projector, in a room that only just goes dark. That
// is projection mapping, and until now it meant leaving the platform for
// Resolume or MadMapper — exporting the work to a file, and mapping the file.
//
// This maps the WORK. A surface names a project and the project runs on the
// wall; a surface can equally name a URL, which is the only reason this camp's
// own work can be shown at all, since it lives in pages that were never
// di.iiii projects.
//
// Everything here is DOM under a CSS matrix3d corner-pin (see cornerPin.js).
// That is a deliberate architectural choice, not a shortcut: a WebGL
// compositor cannot sample a cross-origin page, and half the sources we must
// show are cross-origin pages.

// Sized so five of them tile a 16:9 output without overlapping — a new surface
// lands somewhere visible rather than exactly on top of the last one.
const nextCorners = (index) => {
    const column = index % 3
    const row = Math.floor(index / 3) % 2
    const x = 0.06 + (column * 0.31)
    const y = 0.08 + (row * 0.45)
    return [[x, y], [x + 0.26, y], [x + 0.26, y + 0.38], [x, y + 0.38]]
}

const GRID_CHOICES = [
    { value: 0, label: 'off' },
    { value: 12, label: '12' },
    { value: 24, label: '24' },
    { value: 48, label: '48' },
    { value: 96, label: '96' }
]

const useMeasuredStage = (aspect) => {
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

export default function MapSurface({ projectId, spaceId }) {
    const {
        document: doc, mapping, surfaces, syncState, applyOps,
        addSurface, updateSurface, deleteSurface, reorderSurfaces, setOutput,
        addCue, updateCue, deleteCue, reorderCues, fireCue
    } = useMapDocument(projectId, { role: 'desk' })

    const [selectedId, setSelectedId] = useState(null)
    const [soloId, setSoloId] = useState(null)
    const [maskMode, setMaskMode] = useState(false)
    const [live, setLive] = useState(false)
    const [snap, setSnap] = useState(true)
    const [liveCueId, setLiveCueId] = useState(null)
    const [clipboard, setClipboard] = useState(null)
    const [projectOptions, setProjectOptions] = useState([])
    const [localReference, setLocalReference] = useState('')
    const [transferText, setTransferText] = useState(null)
    const [lightingHere, setLightingHere] = useState(false)

    const output = useMemo(() => mapping?.output || { width: 1920, height: 1080 }, [mapping])
    const cues = useMemo(() => mapping?.cues || [], [mapping])
    const reference = mapping?.reference || { url: '', opacity: 0.5, visible: false }
    const { frameRef, stage } = useMeasuredStage(output.width / output.height)
    const selected = surfaces.find((surface) => surface.id === selectedId) || null

    const syncLabel = useMemo(() => {
        if (syncState?.authExpired) return { tone: 'error', text: 'signed out', detail: 'Sign in again to keep editing.' }
        if (syncState?.pendingSyncError) return { tone: 'error', text: 'not saving', detail: String(syncState.pendingSyncError) }
        return null
    }, [syncState])

    // Measured on the real output route: over HTTP/1.1 the fifth page surface
    // never loads, because each one holds a project event stream open and six
    // persistent connections per origin is the browser's whole budget. The
    // operator has to know that before the room fills, not after.
    const transportNote = useMemo(() => transportWarning(surfaces), [surfaces])

    useEffect(() => {
        let cancelled = false
        listProjects(spaceId)
            .then((result) => {
                if (cancelled) return
                const list = Array.isArray(result) ? result : (result?.projects || [])
                setProjectOptions(list.filter((project) => project?.id && project.id !== projectId))
            })
            .catch(() => { if (!cancelled) setProjectOptions([]) })
        return () => { cancelled = true }
    }, [spaceId, projectId])

    // The lighting desk is a LOCAL runtime only. Probed once, on mount: if
    // nothing answers, the link is not drawn at all rather than offered and
    // then leading to a 404 — a hosted tab must not advertise a rig it has no
    // way to reach.
    useEffect(() => {
        let cancelled = false
        probeLightingDesk().then((here) => { if (!cancelled) setLightingHere(here) })
        return () => { cancelled = true }
    }, [])

    // --- geometry -------------------------------------------------------

    const onCornersChange = useCallback((surfaceId, corners) => updateSurface(surfaceId, { corners }), [updateSurface])
    const onMaskChange = useCallback((surfaceId, mask) => updateSurface(surfaceId, { mask }), [updateSurface])

    // One arrow press is one OUTPUT pixel — one pixel of the projector, the
    // unit the operator is actually watching on the wall. Nudging by a pixel of
    // the preview instead made the step depend on how wide the browser window
    // happened to be.
    const nudge = useCallback((dx, dy) => {
        if (!selected) return
        updateSurface(selected.id, {
            corners: selected.corners.map(([x, y]) => [x + (dx / output.width), y + (dy / output.height)])
        })
    }, [selected, output, updateSurface])

    // --- cues -----------------------------------------------------------

    const onFireCue = useCallback((cue) => {
        if (!cue) return
        fireCue(cue)
        setLiveCueId(cue.id)
    }, [fireCue])

    // A capture records what each surface is SHOWING — never where it is. See
    // the note at the top of MapCueList.jsx.
    const onCaptureCue = useCallback((cueId) => {
        const captured = {}
        surfaces.forEach((surface) => {
            captured[surface.id] = {
                enabled: surface.enabled,
                opacity: surface.opacity,
                source: { kind: surface.source.kind, ref: surface.source.ref }
            }
        })
        updateCue(cueId, { surfaces: captured })
    }, [surfaces, updateCue])

    // --- copying --------------------------------------------------------

    const onDuplicate = useCallback((surfaceId) => {
        const surface = surfaces.find((entry) => entry.id === surfaceId)
        if (!surface) return
        // Offset so the copy is visibly its own thing rather than hiding
        // exactly underneath the original.
        const id = addSurface({
            ...surface,
            name: `${surface.name || surface.id} copy`,
            corners: surface.corners.map(([x, y]) => [x + 0.02, y + 0.02])
        })
        setSelectedId(id)
    }, [surfaces, addSurface])

    const onPasteShape = useCallback((surfaceId) => {
        if (!clipboard) return
        updateSurface(surfaceId, { corners: clipboard.corners, mask: clipboard.mask })
    }, [clipboard, updateSurface])

    const onPasteLook = useCallback((surfaceId) => {
        if (!clipboard) return
        updateSurface(surfaceId, {
            source: clipboard.source,
            resolution: clipboard.resolution,
            opacity: clipboard.opacity,
            brightness: clipboard.brightness,
            contrast: clipboard.contrast,
            saturation: clipboard.saturation,
            hue: clipboard.hue,
            blend: clipboard.blend
        })
    }, [clipboard, updateSurface])

    // A mask that starts as the surface's own outline is the shape most paper
    // actually wants: a rectangle with one or two corners pulled in.
    const onMaskFromOutline = useCallback((surfaceId) => {
        updateSurface(surfaceId, { mask: [[0, 0], [1, 0], [1, 1], [0, 1]] })
        setMaskMode(true)
    }, [updateSurface])

    // --- keyboard -------------------------------------------------------

    useEffect(() => {
        const onKeyDown = (event) => {
            const target = event.target
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
            if (event.metaKey || event.ctrlKey) return

            if (/^[1-9]$/.test(event.key)) {
                const cue = cues.find((entry) => entry.key === event.key)
                if (cue) { onFireCue(cue); event.preventDefault() }
                return
            }

            const step = event.shiftKey ? 10 : 1
            switch (event.key) {
                case 'ArrowLeft': nudge(-step, 0); event.preventDefault(); break
                case 'ArrowRight': nudge(step, 0); event.preventDefault(); break
                case 'ArrowUp': nudge(0, -step); event.preventDefault(); break
                case 'ArrowDown': nudge(0, step); event.preventDefault(); break
                case 'm': case 'M': setMaskMode((value) => !value); break
                case 's': case 'S': setSnap((value) => !value); break
                case 'Escape': setSelectedId(null); setMaskMode(false); break
                default: break
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [nudge, cues, onFireCue])

    // --- carrying a mapping between machines ----------------------------

    const exportMapping = useCallback(() => {
        setTransferText(JSON.stringify(mapping, null, 2))
    }, [mapping])

    const importMapping = useCallback((text) => {
        let incoming = null
        try {
            incoming = JSON.parse(text)
        } catch {
            return 'That is not JSON.'
        }
        if (!incoming || !Array.isArray(incoming.surfaces)) return 'No surfaces in that.'
        // Replace, in one batch: everything currently here goes, then the
        // incoming mapping is built. A merge would silently keep surfaces the
        // person pasting has never seen.
        const ops = [
            ...surfaces.map((surface) => ({ type: 'deleteMappingSurface', payload: { surfaceId: surface.id } })),
            ...cues.map((cue) => ({ type: 'deleteMappingCue', payload: { cueId: cue.id } })),
            ...incoming.surfaces.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })),
            ...(Array.isArray(incoming.cues) ? incoming.cues : []).map((cue) => ({ type: 'createMappingCue', payload: { cue } })),
            {
                type: 'setMappingState',
                payload: {
                    patch: {
                        output: incoming.output,
                        background: incoming.background,
                        grid: incoming.grid,
                        reference: incoming.reference
                    }
                }
            }
        ]
        // ONE batch: an import is a single version bump rather than a stutter
        // of thirty, and a half-applied import can never be what is on the
        // wall when somebody walks in.
        applyOps(ops)
        return ''
    }, [surfaces, cues, applyOps])

    const openOutput = useCallback(() => {
        window.open(buildMapOutputPath(spaceId, projectId), `di-map-out-${projectId}`, 'noopener')
    }, [spaceId, projectId])

    const moveSurface = useCallback((surfaceId, direction) => {
        const index = surfaces.findIndex((surface) => surface.id === surfaceId)
        const target = index + direction
        if (index === -1 || target < 0 || target >= surfaces.length) return
        const ids = surfaces.map((surface) => surface.id)
        ids.splice(target, 0, ids.splice(index, 1)[0])
        reorderSurfaces(ids)
    }, [surfaces, reorderSurfaces])

    const referenceUrl = localReference || reference.url

    return (
        <div className="map-desk">
            <header className="map-bar">
                <div className="map-bar-title">
                    <span className="map-bar-lane">Mapping</span>
                    <span className="map-bar-project">{doc?.projectMeta?.title || projectId}</span>
                </div>
                <div className="map-bar-controls">
                    <label className="map-field map-field-inline">
                        <span>Output</span>
                        <input type="number" min="1" value={output.width}
                            onChange={(event) => setOutput({ output: { ...output, width: Number(event.target.value) || 1 } })} />
                        <span aria-hidden="true">x</span>
                        <input type="number" min="1" value={output.height}
                            onChange={(event) => setOutput({ output: { ...output, height: Number(event.target.value) || 1 } })} />
                    </label>
                    <label className="map-field map-field-inline">
                        <span>Grid</span>
                        <select value={mapping?.grid || 0} onChange={(event) => setOutput({ grid: Number(event.target.value) })}>
                            {GRID_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                        </select>
                    </label>
                    <button type="button" className={`map-toggle${snap ? ' is-on' : ''}`} onClick={() => setSnap((value) => !value)}
                        title="Snap corners to neighbours and the frame. Hold alt while dragging to ignore it.">Snap</button>
                    <button type="button" className={`map-toggle${maskMode ? ' is-on' : ''}`} onClick={() => setMaskMode((value) => !value)}>Mask</button>
                    <button type="button" className={`map-toggle${live ? ' is-on' : ''}`} onClick={() => setLive((value) => !value)}
                        title="Run project, page and camera sources on this screen too. Off by default: the wall needs those pixels more than the desk does.">Live</button>
                    <button type="button" className="map-action" onClick={openOutput}>Open output</button>
                    {lightingHere ? (
                        <a
                            className="map-action"
                            href={lightingDeskPath()}
                            target="_blank"
                            rel="noreferrer"
                            title="The lighting desk on this machine — a map cue can recall one of its scenes"
                        >Light</a>
                    ) : null}
                    {syncLabel ? <span className={`map-sync map-sync-${syncLabel.tone}`} title={syncLabel.detail}>{syncLabel.text}</span> : null}
                    {transportNote ? <span className="map-warning" role="status">{transportNote}</span> : null}
                </div>
            </header>

            <div className="map-body">
                <aside className="map-panel map-panel-left">
                    <div className="map-panel-head">
                        <h2>Surfaces</h2>
                        <button type="button" className="map-action" onClick={() => {
                            const id = addSurface({ name: `Surface ${surfaces.length + 1}`, corners: nextCorners(surfaces.length) })
                            setSelectedId(id)
                        }}>Add</button>
                    </div>
                    <ul className="map-surface-list">
                        {surfaces.map((surface, index) => (
                            <li key={surface.id} className={`map-surface-row${surface.id === selectedId ? ' is-selected' : ''}`}>
                                <button type="button" className="map-surface-name" onClick={() => setSelectedId(surface.id)}>
                                    {surface.name || surface.id}
                                    <span className="map-surface-kind">{surface.source.kind}</span>
                                </button>
                                <div className="map-surface-row-actions">
                                    <button type="button" className={`map-mini${surface.enabled ? '' : ' is-off'}`}
                                        title="Show or hide on the wall"
                                        onClick={() => updateSurface(surface.id, { enabled: !surface.enabled })}>
                                        {surface.enabled ? 'On' : 'Off'}
                                    </button>
                                    <button type="button" className={`map-mini${soloId === surface.id ? ' is-on' : ''}`}
                                        title="Show this one alone"
                                        onClick={() => setSoloId(soloId === surface.id ? null : surface.id)}>Solo</button>
                                    <button type="button" className="map-mini" title="Later in the paint order"
                                        onClick={() => moveSurface(surface.id, 1)} disabled={index === surfaces.length - 1}>Front</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {!surfaces.length ? (
                        <p className="map-empty">No surfaces yet. Add one for each shape on the wall, then drag its corners onto that shape.</p>
                    ) : null}

                    <MapCueList
                        cues={cues}
                        surfaces={surfaces}
                        liveCueId={liveCueId}
                        onFire={onFireCue}
                        onCapture={onCaptureCue}
                        onAdd={() => addCue({ name: `Cue ${cues.length + 1}`, key: cues.length < 9 ? String(cues.length + 1) : '' })}
                        onUpdate={updateCue}
                        onDelete={deleteCue}
                        onReorder={reorderCues}
                    />

                    <div className="map-section">
                        <div className="map-panel-head"><h2>Wall photo</h2></div>
                        <p className="map-empty">A photo of the wall behind the surfaces, to trace paper edges over. Desk only — never projected.</p>
                        <div className="map-row">
                            <label className="map-mini" style={{ cursor: 'pointer' }}>
                                Choose file
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => {
                                    const file = event.target.files?.[0]
                                    if (!file) return
                                    // Held in this browser only: a blob URL means nothing to
                                    // another machine, and a wall photo baked into the
                                    // document as base64 would follow every edit forever.
                                    setLocalReference(URL.createObjectURL(file))
                                    setOutput({ reference: { ...reference, visible: true } })
                                }} />
                            </label>
                            <button type="button" className={`map-mini${reference.visible ? ' is-on' : ''}`}
                                onClick={() => setOutput({ reference: { ...reference, visible: !reference.visible } })}
                                disabled={!referenceUrl}>Show</button>
                        </div>
                        <MapReferenceOpacity value={reference.opacity} onChange={(opacity) => setOutput({ reference: { ...reference, opacity } })} />
                    </div>

                    <div className="map-section">
                        <div className="map-panel-head"><h2>Carry</h2></div>
                        <div className="map-row">
                            <button type="button" className="map-mini" onClick={exportMapping}>Export</button>
                            <button type="button" className="map-mini" onClick={() => setTransferText('')}>Import</button>
                        </div>
                    </div>
                </aside>

                <main className="map-frame" ref={frameRef}>
                    {stage.width > 0 ? (
                        <div className="map-stage-holder" style={{ width: stage.width, height: stage.height }}>
                            <MapStage
                                mapping={mapping}
                                spaceId={spaceId}
                                width={stage.width}
                                height={stage.height}
                                live={live}
                                soloSurfaceId={soloId}
                            />
                            {reference.visible && referenceUrl ? (
                                <img className="map-reference" src={referenceUrl} alt="" style={{ opacity: reference.opacity }} />
                            ) : null}
                            <MapEditorOverlay
                                mapping={mapping}
                                width={stage.width}
                                height={stage.height}
                                selectedSurfaceId={selectedId}
                                maskMode={maskMode}
                                grid={mapping?.grid || 0}
                                snap={snap}
                                onSelectSurface={setSelectedId}
                                onCornersChange={onCornersChange}
                                onMaskChange={onMaskChange}
                            />
                        </div>
                    ) : null}
                    <p className="map-hint">
                        {maskMode
                            ? 'Mask: click inside the selected surface to add a point, drag to move it, shift-click to remove. Alt while dragging ignores snapping.'
                            : 'Drag a corner to pin it. Arrow keys nudge, shift for ten. Alt while dragging ignores the grid and the guides. M masks, S snaps, 1-9 fire cues.'}
                    </p>
                </main>

                <aside className="map-panel map-panel-right">
                    <MapInspector
                        surface={selected}
                        projectOptions={projectOptions}
                        clipboard={clipboard}
                        onUpdate={updateSurface}
                        onDelete={(surfaceId) => { deleteSurface(surfaceId); setSelectedId(null) }}
                        onDuplicate={onDuplicate}
                        onCopy={(surfaceId) => setClipboard(surfaces.find((surface) => surface.id === surfaceId) || null)}
                        onPasteShape={onPasteShape}
                        onPasteLook={onPasteLook}
                        onMaskFromOutline={onMaskFromOutline}
                        onResetCorners={(surfaceId) => updateSurface(surfaceId, {
                            corners: nextCorners(surfaces.findIndex((surface) => surface.id === surfaceId))
                        })}
                    />
                </aside>
            </div>

            {transferText !== null ? (
                <MapTransfer
                    text={transferText}
                    onApply={importMapping}
                    onClose={() => setTransferText(null)}
                />
            ) : null}
        </div>
    )
}

function MapReferenceOpacity({ value, onChange }) {
    return (
        <label className="map-field map-field-slider">
            <span>Opacity</span>
            <input type="range" min="0" max="1" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
            <output>{Number(value).toFixed(2)}</output>
        </label>
    )
}

// Carrying a mapping between machines, as text you can read. Not a file
// download: the machine that aligns a wall is often not the machine that made
// it, and a paste box crosses a chat window, a notes app or a USB stick alike.
function MapTransfer({ text, onApply, onClose }) {
    const [value, setValue] = useState(text)
    const [problem, setProblem] = useState('')
    return (
        <div className="map-transfer">
            <div className="map-transfer-panel">
                <div className="map-panel-head">
                    <h2>{text ? 'Mapping' : 'Paste a mapping'}</h2>
                    <button type="button" className="map-mini" onClick={onClose}>Close</button>
                </div>
                <textarea
                    className="map-transfer-text"
                    value={value}
                    spellCheck="false"
                    onChange={(event) => setValue(event.target.value)}
                />
                {problem ? <p className="map-warning">{problem}</p> : null}
                <div className="map-row">
                    <button type="button" className="map-mini" onClick={() => {
                        navigator.clipboard?.writeText(value).catch(() => { /* no clipboard permission */ })
                    }}>Copy to clipboard</button>
                    <button type="button" className="map-mini" onClick={() => {
                        const message = onApply(value)
                        if (message) setProblem(message)
                        else onClose()
                    }}>Replace this mapping</button>
                </div>
            </div>
        </div>
    )
}
