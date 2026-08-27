import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapStage from './MapStage.jsx'
import MapEditorOverlay from './MapEditorOverlay.jsx'
import { TEST_PATTERNS } from './mapTestPattern.jsx'
import { useMapDocument } from './useMapDocument.js'
import { buildMapOutputPath } from './mapRouting.js'
import { listProjects } from '../project/services/projectsApi.js'
import { transportWarning } from './transportCeiling.js'
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

const SOURCE_KINDS = [
    { id: 'test', label: 'Test pattern' },
    { id: 'project', label: 'Project' },
    { id: 'url', label: 'Web page' },
    { id: 'video', label: 'Video' },
    { id: 'image', label: 'Image' },
    { id: 'colour', label: 'Colour' }
]

const BLEND_MODES = ['normal', 'screen', 'multiply', 'lighten', 'add']

// Sized so five of them tile a 16:9 output without overlapping — a new surface
// lands somewhere visible rather than exactly on top of the last one.
const nextCorners = (index) => {
    const column = index % 3
    const row = Math.floor(index / 3) % 2
    const x = 0.06 + (column * 0.31)
    const y = 0.08 + (row * 0.45)
    return [[x, y], [x + 0.26, y], [x + 0.26, y + 0.38], [x, y + 0.38]]
}

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
    const stage = useMemo(() => {
        if (!(box.width > 0) || !(box.height > 0) || !(aspect > 0)) return { width: 0, height: 0 }
        const width = Math.min(box.width, box.height * aspect)
        return { width: Math.round(width), height: Math.round(width / aspect) }
    }, [box, aspect])

    return { frameRef, stage }
}

export default function MapSurface({ projectId, spaceId }) {
    const {
        document: doc, mapping, surfaces, syncState,
        addSurface, updateSurface, deleteSurface, reorderSurfaces, setOutput
    } = useMapDocument(projectId, { role: 'desk' })

    const [selectedId, setSelectedId] = useState(null)
    const [soloId, setSoloId] = useState(null)
    const [maskMode, setMaskMode] = useState(false)
    const [live, setLive] = useState(false)
    const [projectOptions, setProjectOptions] = useState([])

    const output = useMemo(() => mapping?.output || { width: 1920, height: 1080 }, [mapping])
    const aspect = output.width / output.height
    const { frameRef, stage } = useMeasuredStage(aspect)

    const selected = surfaces.find((surface) => surface.id === selectedId) || null

    // syncState is an object of several independent states. The bar shows the
    // one that matters to somebody standing at a projector: is this desk still
    // reaching the document it is editing?
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

    // The project picker offers what this space actually holds, so wiring a
    // kid's room to a surface is a choice from a list rather than an id typed
    // from a note.
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

    const onCornersChange = useCallback((surfaceId, corners) => {
        updateSurface(surfaceId, { corners })
    }, [updateSurface])

    const onMaskChange = useCallback((surfaceId, mask) => {
        updateSurface(surfaceId, { mask })
    }, [updateSurface])

    // One arrow press is one OUTPUT pixel — one pixel of the projector, the
    // unit the operator is actually watching on the wall. Nudging by a pixel
    // of the preview instead made the step depend on how wide the browser
    // window happened to be.
    const nudge = useCallback((dx, dy) => {
        if (!selected) return
        const corners = selected.corners.map(([x, y]) => [x + (dx / output.width), y + (dy / output.height)])
        updateSurface(selected.id, { corners })
    }, [selected, output, updateSurface])

    useEffect(() => {
        const onKeyDown = (event) => {
            const target = event.target
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
            const step = event.shiftKey ? 10 : 1
            switch (event.key) {
                case 'ArrowLeft': nudge(-step, 0); event.preventDefault(); break
                case 'ArrowRight': nudge(step, 0); event.preventDefault(); break
                case 'ArrowUp': nudge(0, -step); event.preventDefault(); break
                case 'ArrowDown': nudge(0, step); event.preventDefault(); break
                case 'm': case 'M': setMaskMode((value) => !value); break
                case 'Escape': setSelectedId(null); setMaskMode(false); break
                default: break
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [nudge])

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

    const title = doc?.projectMeta?.title || projectId

    return (
        <div className="map-desk">
            <header className="map-bar">
                <div className="map-bar-title">
                    <span className="map-bar-lane">Mapping</span>
                    <span className="map-bar-project">{title}</span>
                </div>
                <div className="map-bar-controls">
                    <label className="map-field map-field-inline">
                        <span>Output</span>
                        <input
                            type="number"
                            value={output.width}
                            min="1"
                            onChange={(event) => setOutput({ output: { ...output, width: Number(event.target.value) || 1 } })}
                        />
                        <span aria-hidden="true">x</span>
                        <input
                            type="number"
                            value={output.height}
                            min="1"
                            onChange={(event) => setOutput({ output: { ...output, height: Number(event.target.value) || 1 } })}
                        />
                    </label>
                    <button
                        type="button"
                        className={`map-toggle${maskMode ? ' is-on' : ''}`}
                        onClick={() => setMaskMode((value) => !value)}
                    >
                        Mask
                    </button>
                    <button
                        type="button"
                        className={`map-toggle${live ? ' is-on' : ''}`}
                        onClick={() => setLive((value) => !value)}
                        title="Run project and page sources on this screen too. Off by default: the wall needs those pixels more than the desk does."
                    >
                        Live
                    </button>
                    <button type="button" className="map-action" onClick={openOutput}>Open output</button>
                    {transportNote ? (
                        <span className="map-warning" role="status">{transportNote}</span>
                    ) : null}
                    {syncLabel ? (
                        <span className={`map-sync map-sync-${syncLabel.tone}`} title={syncLabel.detail}>{syncLabel.text}</span>
                    ) : null}
                </div>
            </header>

            <div className="map-body">
                <aside className="map-panel map-panel-left">
                    <div className="map-panel-head">
                        <h2>Surfaces</h2>
                        <button
                            type="button"
                            className="map-action"
                            onClick={() => {
                                const id = addSurface({
                                    name: `Surface ${surfaces.length + 1}`,
                                    corners: nextCorners(surfaces.length)
                                })
                                setSelectedId(id)
                            }}
                        >
                            Add
                        </button>
                    </div>
                    <ul className="map-surface-list">
                        {surfaces.map((surface, index) => (
                            <li
                                key={surface.id}
                                className={`map-surface-row${surface.id === selectedId ? ' is-selected' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="map-surface-name"
                                    onClick={() => setSelectedId(surface.id)}
                                >
                                    {surface.name || surface.id}
                                    <span className="map-surface-kind">{surface.source.kind}</span>
                                </button>
                                <div className="map-surface-row-actions">
                                    <button
                                        type="button"
                                        className={`map-mini${surface.enabled ? '' : ' is-off'}`}
                                        title="Show or hide on the wall"
                                        onClick={() => updateSurface(surface.id, { enabled: !surface.enabled })}
                                    >
                                        {surface.enabled ? 'On' : 'Off'}
                                    </button>
                                    <button
                                        type="button"
                                        className={`map-mini${soloId === surface.id ? ' is-on' : ''}`}
                                        title="Show this one alone"
                                        onClick={() => setSoloId(soloId === surface.id ? null : surface.id)}
                                    >
                                        Solo
                                    </button>
                                    <button type="button" className="map-mini" title="Later in the paint order" onClick={() => moveSurface(surface.id, 1)} disabled={index === surfaces.length - 1}>Front</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {!surfaces.length ? (
                        <p className="map-empty">No surfaces yet. Add one for each shape on the wall, then drag its corners onto that shape.</p>
                    ) : null}
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
                            <MapEditorOverlay
                                mapping={mapping}
                                width={stage.width}
                                height={stage.height}
                                selectedSurfaceId={selectedId}
                                maskMode={maskMode}
                                onSelectSurface={setSelectedId}
                                onCornersChange={onCornersChange}
                                onMaskChange={onMaskChange}
                            />
                        </div>
                    ) : null}
                    <p className="map-hint">
                        {maskMode
                            ? 'Mask: click inside the selected surface to add a point, drag to move it, alt-click to remove.'
                            : 'Drag a corner to pin it. Arrow keys nudge, shift for ten. M toggles the mask.'}
                    </p>
                </main>

                <aside className="map-panel map-panel-right">
                    {selected ? (
                        <>
                            <div className="map-panel-head">
                                <h2>{selected.name || selected.id}</h2>
                                <button type="button" className="map-mini is-danger" onClick={() => { deleteSurface(selected.id); setSelectedId(null) }}>Delete</button>
                            </div>

                            <label className="map-field">
                                <span>Name</span>
                                <input
                                    type="text"
                                    value={selected.name}
                                    onChange={(event) => updateSurface(selected.id, { name: event.target.value })}
                                />
                            </label>

                            <label className="map-field">
                                <span>Source</span>
                                <select
                                    value={selected.source.kind}
                                    onChange={(event) => updateSurface(selected.id, { source: { kind: event.target.value, ref: '' } })}
                                >
                                    {SOURCE_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                                </select>
                            </label>

                            {selected.source.kind === 'test' ? (
                                <label className="map-field">
                                    <span>Pattern</span>
                                    <select
                                        value={selected.source.ref || 'grid'}
                                        onChange={(event) => updateSurface(selected.id, { source: { kind: 'test', ref: event.target.value } })}
                                    >
                                        {TEST_PATTERNS.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
                                    </select>
                                </label>
                            ) : null}

                            {selected.source.kind === 'project' ? (
                                <label className="map-field">
                                    <span>Project</span>
                                    <select
                                        value={selected.source.ref}
                                        onChange={(event) => updateSurface(selected.id, { source: { kind: 'project', ref: event.target.value } })}
                                    >
                                        <option value="">Choose a project</option>
                                        {projectOptions.map((project) => (
                                            <option key={project.id} value={project.id}>{project.title || project.id}</option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}

                            {['url', 'video', 'image'].includes(selected.source.kind) ? (
                                <label className="map-field">
                                    <span>{selected.source.kind === 'url' ? 'Address' : 'File URL'}</span>
                                    <input
                                        type="text"
                                        value={selected.source.ref}
                                        placeholder={selected.source.kind === 'url' ? 'https://' : 'https://'}
                                        onChange={(event) => updateSurface(selected.id, { source: { kind: selected.source.kind, ref: event.target.value } })}
                                    />
                                </label>
                            ) : null}

                            {selected.source.kind === 'colour' ? (
                                <label className="map-field">
                                    <span>Colour</span>
                                    <input
                                        type="color"
                                        value={selected.source.ref || '#ffffff'}
                                        onChange={(event) => updateSurface(selected.id, { source: { kind: 'colour', ref: event.target.value } })}
                                    />
                                </label>
                            ) : null}

                            <label className="map-field map-field-inline">
                                <span>Source size</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={selected.resolution[0]}
                                    onChange={(event) => updateSurface(selected.id, { resolution: [Number(event.target.value) || 1, selected.resolution[1]] })}
                                />
                                <span aria-hidden="true">x</span>
                                <input
                                    type="number"
                                    min="1"
                                    value={selected.resolution[1]}
                                    onChange={(event) => updateSurface(selected.id, { resolution: [selected.resolution[0], Number(event.target.value) || 1] })}
                                />
                            </label>

                            <MapSlider label="Opacity" value={selected.opacity} min={0} max={1} step={0.01} onChange={(value) => updateSurface(selected.id, { opacity: value })} />
                            <MapSlider label="Brightness" value={selected.brightness} min={0} max={2} step={0.01} onChange={(value) => updateSurface(selected.id, { brightness: value })} />
                            <MapSlider label="Contrast" value={selected.contrast} min={0} max={2} step={0.01} onChange={(value) => updateSurface(selected.id, { contrast: value })} />
                            <MapSlider label="Saturation" value={selected.saturation} min={0} max={3} step={0.01} onChange={(value) => updateSurface(selected.id, { saturation: value })} />
                            <MapSlider label="Hue" value={selected.hue} min={-180} max={180} step={1} onChange={(value) => updateSurface(selected.id, { hue: value })} />

                            <label className="map-field">
                                <span>Blend</span>
                                <select value={selected.blend} onChange={(event) => updateSurface(selected.id, { blend: event.target.value })}>
                                    {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                                </select>
                            </label>

                            <div className="map-panel-actions">
                                <button type="button" className="map-mini" onClick={() => updateSurface(selected.id, { mask: [] })} disabled={!selected.mask.length}>Clear mask</button>
                                <button type="button" className="map-mini" onClick={() => updateSurface(selected.id, { corners: nextCorners(surfaces.indexOf(selected)) })}>Reset corners</button>
                            </div>
                        </>
                    ) : (
                        <p className="map-empty">Pick a surface to change what it shows.</p>
                    )}
                </aside>
            </div>
        </div>
    )
}

function MapSlider({ label, value, min, max, step, onChange }) {
    return (
        <label className="map-field map-field-slider">
            <span>{label}</span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
            <output>{Number(value).toFixed(step < 1 ? 2 : 0)}</output>
        </label>
    )
}
