import { useRef, useState } from 'react'
import { TEST_PATTERNS } from './mapTestPattern.jsx'
import { resolveMapSourceRef } from './MapSourceView.jsx'
import { uploadProjectAsset } from '../project/services/projectsApi.js'
import { boundsOfCorners, isScreenKind, presetScreens, rectCorners, screenInput, screenPresets, visualKindForFile, visualNameForFile } from './wallScreens.js'

// The desk's new parts: screens on the left, the visuals bank along the bottom,
// and the two inspectors on the right. The old surface list and inspector stay
// as they were (MapDeskParts.jsx, MapInspector.jsx) — the Perform desk uses
// them, and a project mapped the old way still opens and still edits.

const KIND_LABEL = {
    video: 'Video', image: 'Image', html: 'HTML', url: 'Web', camera: 'Camera', ndi: 'NDI',
    stream: 'Input', project: 'di', colour: 'Colour', test: 'Test', network: 'Pictures'
}

const ADD_CHOICES = [
    { id: 'file', label: 'File: video, image or HTML…' },
    { id: 'url', label: 'Web link' },
    { id: 'camera', label: 'Camera' },
    { id: 'ndi', label: 'NDI source' },
    { id: 'project', label: 'di project' },
    { id: 'test', label: 'Test card' },
    { id: 'colour', label: 'Colour' }
]

const FILE_ACCEPT = 'video/*,image/*,.html,.htm,text/html'

// --- bringing files in ------------------------------------------------

// Upload each file to the project and hand back one visual per file. HTML is
// uploaded like any other file; serverXR serves it sandboxed.
export function useVisualUpload({ projectId, onUpsertAsset }) {
    const [state, setState] = useState({ busy: false, notice: '', tone: 'ok' })
    const bringIn = async (fileList) => {
        const files = Array.from(fileList || [])
        const usable = files.filter((file) => visualKindForFile(file))
        if (!files.length) return []
        if (!usable.length) {
            setState({ busy: false, notice: 'Only video, image and HTML files can be visuals.', tone: 'error' })
            return []
        }
        if (!projectId) {
            setState({ busy: false, notice: 'Save the project before bringing in a file.', tone: 'error' })
            return []
        }
        setState({ busy: true, notice: `Bringing in ${usable.length === 1 ? usable[0].name : `${usable.length} files`}…`, tone: 'ok' })
        const made = []
        const failed = []
        for (const file of usable) {
            try {
                const asset = await uploadProjectAsset(projectId, file)
                if (!asset?.id) throw new Error('no file came back')
                onUpsertAsset?.(asset)
                made.push({ name: visualNameForFile(file), source: { kind: visualKindForFile(file), ref: asset.url || '' } })
            } catch (error) {
                failed.push(`${file.name}: ${error?.message || 'could not bring it in'}`)
            }
        }
        const skipped = files.length - usable.length
        setState({
            busy: false,
            tone: failed.length ? 'error' : 'ok',
            notice: [
                made.length ? `Added ${made.length} visual${made.length === 1 ? '' : 's'}.` : '',
                skipped ? `${skipped} skipped (not video, image or HTML).` : '',
                ...failed
            ].filter(Boolean).join(' ')
        })
        return made
    }
    return { ...state, bringIn }
}

// --- screens ----------------------------------------------------------

export function MapScreenList({ surfaces, visuals, output, selectedId, soloId, onSelect, onToggle, onSolo, onAddScreens }) {
    const visualName = (id) => visuals.find((visual) => visual.id === id)?.name || 'missing visual'
    const plays = (surface) => {
        if (surface.source.kind === 'wall') return 'wall'
        if (surface.source.kind === 'visual') return visualName(surface.source.ref)
        return KIND_LABEL[surface.source.kind] || surface.source.kind
    }
    return (
        <>
            <div className="map-panel-head">
                <h2>Screens</h2>
            </div>
            <label className="map-field">
                <span className="map-sr-only">Add screens</span>
                <select
                    className="map-add-screens"
                    value=""
                    onChange={(event) => {
                        const preset = screenPresets.find((entry) => entry.id === event.target.value)
                        if (preset) onAddScreens(preset)
                    }}
                >
                    <option value="">+ Add screens…</option>
                    {screenPresets.map((preset) => {
                        const each = presetScreens(preset, output)[0].resolution
                        return <option key={preset.id} value={preset.id}>{preset.label} · {each[0]}×{each[1]}</option>
                    })}
                </select>
            </label>
            <ul className="map-surface-list">
                {surfaces.map((surface) => (
                    <li key={surface.id} className={`map-surface-row map-screen-row${surface.id === selectedId ? ' is-selected' : ''}${surface.enabled ? '' : ' is-hidden'}`}>
                        <button type="button" className="map-surface-name" onClick={() => onSelect(surface.id)}>
                            {surface.name || surface.id}
                            <span className={`map-surface-kind${isScreenKind(surface.source.kind) ? '' : ' is-old'}`}>{plays(surface)}</span>
                        </button>
                        <div className="map-surface-row-actions">
                            <button type="button" className={`map-mini${surface.enabled ? '' : ' is-off'}`}
                                title="Show or hide on the wall"
                                onClick={() => onToggle(surface)}>
                                {surface.enabled ? 'On' : 'Off'}
                            </button>
                            <button type="button" className={`map-mini${soloId === surface.id ? ' is-on' : ''}`}
                                title="Show this one alone on this desk. The output still shows every screen."
                                onClick={() => onSolo(soloId === surface.id ? null : surface.id)}>Solo</button>
                        </div>
                    </li>
                ))}
            </ul>
            {!surfaces.length ? (
                <p className="map-empty">No screens yet. Pick how your wall is built from “Add screens”, then drag corners to line each one up.</p>
            ) : null}
        </>
    )
}

// Corner and picture values typed in OUTPUT pixels, the unit the wall is
// counted in. Stored normalised.
const toPx = (value, size) => Math.round(value * size * 100) / 100
const fromPx = (value, size) => Number(value) / size

function PxField({ label, value, onChange }) {
    return (
        <label className="map-px">
            <span>{label}</span>
            <input type="number" step="1" value={value} onChange={(event) => {
                if (event.target.value === '' || !Number.isFinite(Number(event.target.value))) return
                onChange(Number(event.target.value))
            }} />
        </label>
    )
}

export function MapScreenInspector({ surface, visuals, output, onUpdate, onDelete, onDuplicate, onUseDirectSource }) {
    const W = output.width
    const H = output.height
    const input = screenInput(surface)
    const followsCorners = !Array.isArray(surface.input)
    const playsValue = surface.source.kind === 'visual' ? surface.source.ref : 'wall'
    const setCorner = (index, axis, px) => {
        const corners = surface.corners.map((corner) => [...corner])
        corners[index][axis] = fromPx(px, axis === 0 ? W : H)
        onUpdate(surface.id, { corners })
    }
    const setInput = (index, px) => {
        const next = [...input]
        next[index] = fromPx(px, index % 2 === 0 ? W : H)
        onUpdate(surface.id, { input: next })
    }
    return (
        <div className="map-inspector map-screen-inspector">
            <div className="map-panel-head"><h2>Screen</h2></div>
            <label className="map-field">
                <span>Name</span>
                <input type="text" value={surface.name} onChange={(event) => onUpdate(surface.id, { name: event.target.value })} />
            </label>
            <label className="map-field">
                <span>Plays</span>
                <select value={playsValue} onChange={(event) => {
                    const value = event.target.value
                    onUpdate(surface.id, { source: value === 'wall' ? { kind: 'wall', ref: '' } : { kind: 'visual', ref: value } })
                }}>
                    <option value="wall">The wall — whatever is playing</option>
                    {visuals.map((visual) => <option key={visual.id} value={visual.id}>Only: {visual.name}</option>)}
                </select>
            </label>

            <div className="map-section">
                <div className="map-panel-head"><h2>Corners · px</h2></div>
                {[['TL', 'Top left'], ['TR', 'Top right'], ['BR', 'Bottom right'], ['BL', 'Bottom left']].map(([name, title], index) => (
                    <div key={name} className="map-px-row">
                        <span className="map-px-name" title={title}>{name}</span>
                        <PxField label="X" value={toPx(surface.corners[index][0], W)} onChange={(px) => setCorner(index, 0, px)} />
                        <PxField label="Y" value={toPx(surface.corners[index][1], H)} onChange={(px) => setCorner(index, 1, px)} />
                    </div>
                ))}
            </div>

            {surface.source.kind === 'wall' ? (
                <div className="map-section">
                    <div className="map-panel-head"><h2>Piece of the wall · px</h2></div>
                    <p className="map-empty">Which part of the wall picture this screen shows. Corners decide where it lands.</p>
                    <div className="map-px-row">
                        <PxField label="X" value={toPx(input[0], W)} onChange={(px) => setInput(0, px)} />
                        <PxField label="Y" value={toPx(input[1], H)} onChange={(px) => setInput(1, px)} />
                    </div>
                    <div className="map-px-row">
                        <PxField label="W" value={toPx(input[2], W)} onChange={(px) => setInput(2, px)} />
                        <PxField label="H" value={toPx(input[3], H)} onChange={(px) => setInput(3, px)} />
                    </div>
                    <div className="map-row">
                        <button type="button" className={`map-mini${followsCorners ? ' is-on' : ''}`}
                            title="Show exactly what is under the corners. Moving a corner moves the window, the picture stays put."
                            onClick={() => onUpdate(surface.id, { input: followsCorners ? boundsOfCorners(surface.corners) : null })}>
                            Follow corners
                        </button>
                        <button type="button" className="map-mini"
                            title="Put the corners back on the piece: no warp, pixel for pixel"
                            onClick={() => onUpdate(surface.id, { corners: rectCorners(input) })}>
                            Unwarp
                        </button>
                    </div>
                </div>
            ) : null}

            <label className="map-field map-field-slider">
                <span>Opacity</span>
                <input type="range" min="0" max="1" step="0.01" value={surface.opacity ?? 1}
                    onChange={(event) => onUpdate(surface.id, { opacity: Number(event.target.value) })} />
                <output>{Number(surface.opacity ?? 1).toFixed(2)}</output>
            </label>

            <div className="map-row">
                <button type="button" className="map-mini" onClick={() => onDuplicate(surface.id)}>Duplicate</button>
                <button type="button" className="map-mini map-danger" onClick={() => onDelete(surface.id)}>Delete</button>
            </div>
            <button type="button" className="map-link" onClick={() => onUseDirectSource(surface.id)}
                title="The old way: this screen gets its own source and all the old settings">
                Give this screen its own source instead
            </button>
        </div>
    )
}

// --- visuals ----------------------------------------------------------

function VisualThumb({ visual }) {
    const { kind, ref } = visual.source
    if (kind === 'image' && ref) return <img className="map-visual-thumb-media" src={resolveMapSourceRef(ref)} alt="" draggable="false" />
    if (kind === 'video' && ref) return <video className="map-visual-thumb-media" src={`${resolveMapSourceRef(ref)}#t=0.5`} muted playsInline preload="metadata" />
    if (kind === 'colour') return <span className="map-visual-thumb-fill" style={{ background: ref || '#ffffff' }} />
    return <span className="map-visual-thumb-kind">{KIND_LABEL[kind] || kind}</span>
}

export function MapVisualBank({
    visuals, playing, selectedVisualId, fade, upload,
    onPlay, onSelect, onAdd, onFade, onReorder
}) {
    const fileRef = useRef(null)
    const [dragId, setDragId] = useState(null)
    const addFrom = async (files) => {
        const made = await upload.bringIn(files)
        made.forEach((visual) => onAdd(visual))
    }
    return (
        <section className="map-bank" aria-label="Visuals">
            <div className="map-bank-head">
                <h2>Visuals</h2>
                <select className="map-bank-add" value="" disabled={upload.busy} onChange={(event) => {
                    const choice = event.target.value
                    if (choice === 'file') fileRef.current?.click()
                    else if (choice) onAdd({ choice })
                }}>
                    <option value="">{upload.busy ? 'Bringing in…' : '+ Add'}</option>
                    {ADD_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                </select>
                <input ref={fileRef} type="file" multiple accept={FILE_ACCEPT} style={{ display: 'none' }}
                    onChange={(event) => { addFrom(event.target.files); event.target.value = '' }} />
                <label className="map-field map-field-inline" title="How long one visual takes to fade into the next">
                    <span>Fade</span>
                    <input type="number" min="0" max="30" step="0.1" value={fade}
                        onChange={(event) => onFade(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} />
                    <span aria-hidden="true">s</span>
                </label>
                <span className={`map-bank-notice${upload.tone === 'error' ? ' is-error' : ''}`} role="status">
                    {upload.notice || 'Drop files anywhere. Click to play on the wall, drag onto a screen to play it there only. Keys 1–9, 0 for black.'}
                </span>
            </div>
            <div className="map-bank-tiles" role="list">
                <button type="button" className={`map-visual map-visual-black${playing ? '' : ' is-playing'}`} onClick={() => onPlay('')}
                    title="Nothing on the wall (key 0)">
                    <span className="map-visual-thumb"><span className="map-visual-thumb-fill" style={{ background: '#000' }} /></span>
                    <span className="map-visual-name"><kbd>0</kbd> Black</span>
                </button>
                {visuals.map((visual, index) => (
                    <div
                        key={visual.id}
                        role="listitem"
                        className={`map-visual${visual.id === playing ? ' is-playing' : ''}${visual.id === selectedVisualId ? ' is-selected' : ''}${visual.id === dragId ? ' is-dragging' : ''}`}
                        draggable="true"
                        onDragStart={(event) => {
                            event.dataTransfer.setData('application/x-di-visual', visual.id)
                            event.dataTransfer.effectAllowed = 'copyMove'
                            setDragId(visual.id)
                        }}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(event) => {
                            if (event.dataTransfer.types.includes('application/x-di-visual')) event.preventDefault()
                        }}
                        onDrop={(event) => {
                            const from = event.dataTransfer.getData('application/x-di-visual')
                            if (!from || from === visual.id) return
                            event.preventDefault()
                            event.stopPropagation()
                            const ids = visuals.map((entry) => entry.id).filter((id) => id !== from)
                            ids.splice(ids.indexOf(visual.id), 0, from)
                            onReorder(ids)
                        }}
                    >
                        <button type="button" className="map-visual-play" onClick={() => onPlay(visual.id)}
                            title={`Play “${visual.name}” on the wall${index < 9 ? ` (key ${index + 1})` : ''}`}>
                            <span className="map-visual-thumb"><VisualThumb visual={visual} /></span>
                            <span className="map-visual-name">{index < 9 ? <kbd>{index + 1}</kbd> : null} {visual.name}</span>
                        </button>
                        <button type="button" className="map-visual-edit" onClick={() => onSelect(visual.id)} title="Edit this visual">⋯</button>
                    </div>
                ))}
                <button type="button" className="map-visual map-visual-add" onClick={() => fileRef.current?.click()} disabled={upload.busy}
                    title="Bring in video, image or HTML files">
                    <span className="map-visual-thumb"><span className="map-visual-thumb-kind">+</span></span>
                    <span className="map-visual-name">Add files</span>
                </button>
            </div>
        </section>
    )
}

export function MapVisualInspector({ visual, playing, projectOptions, upload, onUpdate, onDelete, onPlay, onClose }) {
    const fileRef = useRef(null)
    const { kind, ref } = visual.source
    const setRef = (value) => onUpdate(visual.id, { source: { kind, ref: value } })
    return (
        <div className="map-inspector map-visual-inspector">
            <div className="map-panel-head">
                <h2>Visual</h2>
                <button type="button" className="map-mini" onClick={onClose}>Close</button>
            </div>
            <label className="map-field">
                <span>Name</span>
                <input type="text" value={visual.name} onChange={(event) => onUpdate(visual.id, { name: event.target.value })} />
            </label>
            <p className="map-empty">{KIND_LABEL[kind] || kind}{visual.id === playing ? ' · on the wall now' : ''}</p>

            {kind === 'video' || kind === 'image' || kind === 'html' ? (
                <div className="map-row">
                    <button type="button" className="map-mini" disabled={upload.busy} onClick={() => fileRef.current?.click()}>
                        {upload.busy ? 'Bringing in…' : 'Replace file'}
                    </button>
                    <input ref={fileRef} type="file" accept={FILE_ACCEPT} style={{ display: 'none' }} onChange={async (event) => {
                        const [made] = await upload.bringIn(event.target.files)
                        event.target.value = ''
                        if (made) onUpdate(visual.id, { source: made.source })
                    }} />
                </div>
            ) : null}
            {kind === 'url' ? (
                <label className="map-field">
                    <span>Address</span>
                    <input type="url" placeholder="https://…" value={ref} onChange={(event) => setRef(event.target.value.trim())} />
                </label>
            ) : null}
            {kind === 'colour' ? (
                <label className="map-field">
                    <span>Colour</span>
                    <input type="color" value={ref || '#ffffff'} onChange={(event) => setRef(event.target.value)} />
                </label>
            ) : null}
            {kind === 'test' ? (
                <label className="map-field">
                    <span>Pattern</span>
                    <select value={ref || 'card'} onChange={(event) => setRef(event.target.value)}>
                        {TEST_PATTERNS.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
                    </select>
                </label>
            ) : null}
            {kind === 'ndi' || kind === 'stream' ? (
                <label className="map-field">
                    <span>{kind === 'ndi' ? 'NDI source name' : 'Input name'}</span>
                    <input type="text" value={ref} onChange={(event) => setRef(event.target.value)} />
                </label>
            ) : null}
            {kind === 'project' ? (
                <label className="map-field">
                    <span>Project</span>
                    <select value={ref} onChange={(event) => setRef(event.target.value)}>
                        <option value="">Choose…</option>
                        {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.title || project.id}</option>)}
                    </select>
                </label>
            ) : null}
            {kind === 'camera' ? <p className="map-empty">The default camera of the machine that shows the wall.</p> : null}
            {upload.notice ? <p className={`map-empty${upload.tone === 'error' ? ' map-warning' : ''}`}>{upload.notice}</p> : null}

            <div className="map-row">
                <button type="button" className="map-mini" onClick={() => onPlay(visual.id)}>Play on wall</button>
                <button type="button" className="map-mini map-danger" onClick={() => onDelete(visual.id)}>Remove</button>
            </div>
        </div>
    )
}

// What a choice from "+ Add" starts as.
export const visualForChoice = (choice, count) => {
    const number = count + 1
    switch (choice) {
        case 'url': return { name: `Web ${number}`, source: { kind: 'url', ref: '' } }
        case 'camera': return { name: 'Camera', source: { kind: 'camera', ref: '' } }
        case 'ndi': return { name: 'NDI', source: { kind: 'ndi', ref: '' } }
        case 'project': return { name: 'di project', source: { kind: 'project', ref: '' } }
        case 'colour': return { name: 'Colour', source: { kind: 'colour', ref: '#ffffff' } }
        case 'test': return { name: 'Test card', source: { kind: 'test', ref: 'grid' } }
        default: return null
    }
}
