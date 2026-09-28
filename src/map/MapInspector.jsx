import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TEST_PATTERN, TEST_PATTERNS } from './mapTestPattern.jsx'
import { ndiSourceOptions, ndiSourceStatus, streamInputOptions, streamInputStatus } from './mapMachines.js'
import { uploadProjectAsset } from '../project/services/projectsApi.js'
import { cornerFromOutput, cornerToOutput, isWarpable, pointFromOutput, pointToOutput } from './pointEditing.js'

const SOURCE_KINDS = [
    { id: 'test', label: 'Test pattern' },
    { id: 'project', label: 'Project' },
    { id: 'url', label: 'Web page' },
    { id: 'video', label: 'Video' },
    { id: 'image', label: 'Image' },
    { id: 'camera', label: 'Camera' },
    { id: 'stream', label: 'Stream (input by name)' },
    { id: 'ndi', label: 'NDI (source by name)' },
    { id: 'network', label: 'Pictures' },
    { id: 'colour', label: 'Colour' }
]

const BLEND_MODES = ['normal', 'screen', 'multiply', 'lighten', 'add']
const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL']

// THE PROPERTIES of one surface — Resolume's right-hand panel, in the same
// order a slice's are read: what it is, where it goes, what it looks like.
// Every number here can be typed. A corner or a point is shown in OUTPUT
// pixels, the projector's own, because that is the number a person on a
// ladder reads off the wall; the conversion lives in pointEditing.js.
export default function MapInspector({
    surface,
    selectionCount = 0,
    output = { width: 1920, height: 1080 },
    projectId,
    assets = [],
    projectOptions,
    pictureOutOptions = [],
    machines = [],
    clipboard,
    selectedPointIndex = null,
    onSelectPoint,
    onUpdate,
    onUpsertAsset,
    onDelete,
    onDuplicate,
    onCopy,
    onPasteShape,
    onPasteLook,
    onAddPoint,
    onClearPoints,
    onResetCorners,
    onReorder
}) {
    if (!surface) return <p className="map-empty">Pick a surface to see its numbers. Ctrl+A picks them all.</p>

    const setSource = (kind, ref = '') => onUpdate(surface.id, { source: { kind, ref } })
    const setCorner = (index, axis, value) => {
        const current = cornerToOutput(surface.corners[index], output)
        current[axis] = value
        onUpdate(surface.id, { corners: surface.corners.map((corner, i) => (i === index ? cornerFromOutput(current, output) : corner)) })
    }
    const setPoint = (index, axis, value) => {
        const current = pointToOutput(surface.points[index], output)
        current[axis] = value
        onUpdate(surface.id, { points: pointFromOutput(surface.points, index, output, current) })
    }
    const bendable = isWarpable(surface.source?.kind)
    const points = bendable ? (surface.points || []).map((point) => pointToOutput(point, output)) : []
    const shaped = Boolean(surface.points?.length || surface.mask?.length)

    return (
        <div className="map-props">
            <div className="map-panel-head">
                <h2>
                    {surface.name || surface.id}
                    {selectionCount > 1 ? <span className="map-props-count" title="Delete, Ctrl+C, Ctrl+D and the arrows act on the whole selection">+{selectionCount - 1}</span> : null}
                </h2>
                <button type="button" className="map-mini is-danger" onClick={() => onDelete(surface.id)} title="Delete">Delete</button>
            </div>

            <label className="map-field">
                <span>Name</span>
                <input type="text" value={surface.name} onChange={(event) => onUpdate(surface.id, { name: event.target.value })} />
            </label>

            <label className="map-field">
                <span>Source</span>
                <select value={surface.source.kind} onChange={(event) => setSource(event.target.value)}>
                    {SOURCE_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                </select>
            </label>

            {surface.source.kind === 'test' ? (
                <label className="map-field">
                    <span>Pattern</span>
                    <select value={surface.source.ref || DEFAULT_TEST_PATTERN} onChange={(event) => setSource('test', event.target.value)}>
                        {TEST_PATTERNS.map((pattern) => <option key={pattern.id} value={pattern.id}>{pattern.label}</option>)}
                    </select>
                </label>
            ) : null}

            {surface.source.kind === 'project' ? (
                <label className="map-field">
                    <span>Project</span>
                    <select value={surface.source.ref} onChange={(event) => setSource('project', event.target.value)}>
                        <option value="">Choose a project</option>
                        {projectOptions.map((project) => (
                            <option key={project.id} value={project.id}>{project.title || project.id}</option>
                        ))}
                    </select>
                </label>
            ) : null}

            {surface.source.kind === 'network' ? (
                <label className="map-field">
                    <span>Picture Out</span>
                    <select value={surface.source.ref} onChange={(event) => setSource('network', event.target.value)}>
                        <option value="">{pictureOutOptions.length ? 'Choose a Picture Out' : 'No Picture Out in this project yet'}</option>
                        {pictureOutOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                </label>
            ) : null}

            {surface.source.kind === 'camera' ? (
                <>
                    <MapCameraPicker value={surface.source.ref} onChange={(deviceId) => setSource('camera', deviceId)} />
                    <MapEffectFields effect={surface.effect} onChange={(patch) => onUpdate(surface.id, { effect: { ...surface.effect, ...patch } })} />
                </>
            ) : null}

            {surface.source.kind === 'stream' ? (
                <>
                    <MapStreamPicker value={surface.source.ref} machines={machines} onChange={(name) => setSource('stream', name)} />
                    <MapEffectFields effect={surface.effect} onChange={(patch) => onUpdate(surface.id, { effect: { ...surface.effect, ...patch } })} />
                </>
            ) : null}

            {surface.source.kind === 'ndi' ? (
                <MapNdiPicker value={surface.source.ref} machines={machines} onChange={(name) => setSource('ndi', name)} />
            ) : null}

            {['video', 'image'].includes(surface.source.kind) ? (
                <MapFileSourceField
                    kind={surface.source.kind}
                    projectId={projectId}
                    assets={assets}
                    onUpsertAsset={onUpsertAsset}
                    onChangeRef={(ref) => setSource(surface.source.kind, ref)}
                />
            ) : null}

            {['url', 'video', 'image'].includes(surface.source.kind) ? (
                <label className="map-field">
                    <span>Address</span>
                    <input
                        type="text"
                        value={surface.source.ref}
                        placeholder="https://"
                        onChange={(event) => setSource(surface.source.kind, event.target.value)}
                    />
                </label>
            ) : null}

            {surface.source.kind === 'colour' ? (
                <label className="map-field">
                    <span>Colour</span>
                    <input type="color" value={surface.source.ref || '#ffffff'} onChange={(event) => setSource('colour', event.target.value)} />
                </label>
            ) : null}

            <label className="map-field map-field-inline">
                <span>Source size</span>
                <input
                    type="number"
                    min="1"
                    value={surface.resolution[0]}
                    onChange={(event) => onUpdate(surface.id, { resolution: [Number(event.target.value) || 1, surface.resolution[1]] })}
                />
                <span aria-hidden="true">×</span>
                <input
                    type="number"
                    min="1"
                    value={surface.resolution[1]}
                    onChange={(event) => onUpdate(surface.id, { resolution: [surface.resolution[0], Number(event.target.value) || 1] })}
                />
            </label>

            <section className="map-props-section">
                <div className="map-panel-head">
                    <h3>Corners <span className="map-props-unit">px</span></h3>
                    <button type="button" className="map-mini" onClick={() => onResetCorners(surface.id)} title="Put the four corners back on a plain rectangle">Reset</button>
                </div>
                <div className="map-xy-head" aria-hidden="true"><span /><span>X</span><span>Y</span></div>
                {surface.corners.map((corner, index) => {
                    const [x, y] = cornerToOutput(corner, output)
                    return (
                        <div key={index} className="map-xy">
                            <span className="map-xy-label">{CORNER_LABELS[index]}</span>
                            <input type="number" step="1" value={Math.round(x)} aria-label={`${CORNER_LABELS[index]} x`}
                                onChange={(event) => setCorner(index, 0, Number(event.target.value) || 0)} />
                            <input type="number" step="1" value={Math.round(y)} aria-label={`${CORNER_LABELS[index]} y`}
                                onChange={(event) => setCorner(index, 1, Number(event.target.value) || 0)} />
                        </div>
                    )
                })}
            </section>

            <section className="map-props-section">
                <div className="map-panel-head">
                    <h3>Points <span className="map-props-unit">px</span></h3>
                    <div className="map-row">
                        {bendable ? (
                            <button type="button" className="map-mini" onClick={() => onAddPoint(surface.id)} title="A point on the edge after the held one — or double-click an edge on the stage">+ Point</button>
                        ) : null}
                        <button type="button" className="map-mini" onClick={() => onClearPoints(surface.id)} disabled={!shaped} title="Back to the plain four-cornered picture">Clear</button>
                    </div>
                </div>
                {!bendable ? (
                    <p className="map-empty">A web page or a project is pinned by its four corners and cannot be bent — a page cannot be drawn through a mesh. Bring it in as a video or an image to bend it.</p>
                ) : points.length ? (
                    <>
                        <div className="map-xy-head" aria-hidden="true"><span /><span>X</span><span>Y</span></div>
                        {points.map((point, index) => (
                            <div key={index} className={`map-xy map-xy-point${index === selectedPointIndex ? ' is-selected' : ''}`}>
                                <button type="button" className="map-xy-label" onClick={() => onSelectPoint?.(index === selectedPointIndex ? null : index)} title="Hold this point">
                                    {index + 1}
                                </button>
                                {/* Typing into a point's field holds that point, so the
                                    stage shows which number is being changed. */}
                                <input type="number" step="1" value={Math.round(point[0])} aria-label={`point ${index + 1} x`}
                                    onFocus={() => onSelectPoint?.(index)}
                                    onChange={(event) => setPoint(index, 0, Number(event.target.value) || 0)} />
                                <input type="number" step="1" value={Math.round(point[1])} aria-label={`point ${index + 1} y`}
                                    onFocus={() => onSelectPoint?.(index)}
                                    onChange={(event) => setPoint(index, 1, Number(event.target.value) || 0)} />
                            </div>
                        ))}
                    </>
                ) : (
                    <p className="map-empty">Pinned flat by its corners. Double-click an edge and drag the point to bend the picture round a pillar or a fold.</p>
                )}
            </section>

            <section className="map-props-section">
                <div className="map-panel-head"><h3>Look</h3></div>
                <MapSlider label="Opacity" value={surface.opacity} min={0} max={1} step={0.01} onChange={(value) => onUpdate(surface.id, { opacity: value })} />
                <MapSlider label="Brightness" value={surface.brightness} min={0} max={2} step={0.01} onChange={(value) => onUpdate(surface.id, { brightness: value })} />
                <MapSlider label="Contrast" value={surface.contrast} min={0} max={2} step={0.01} onChange={(value) => onUpdate(surface.id, { contrast: value })} />
                <MapSlider label="Saturation" value={surface.saturation} min={0} max={3} step={0.01} onChange={(value) => onUpdate(surface.id, { saturation: value })} />
                <MapSlider label="Hue" value={surface.hue} min={-180} max={180} step={1} onChange={(value) => onUpdate(surface.id, { hue: value })} />
                <label className="map-field map-field-inline">
                    <span>Blend</span>
                    <select value={surface.blend} onChange={(event) => onUpdate(surface.id, { blend: event.target.value })}>
                        {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                </label>
            </section>

            <section className="map-props-section">
                <div className="map-panel-head"><h3>Order</h3></div>
                <div className="map-row">
                    <button type="button" className="map-mini" onClick={() => onReorder?.(surface.id, -1)} title="Painted earlier — behind its neighbours">↓ Back</button>
                    <button type="button" className="map-mini" onClick={() => onReorder?.(surface.id, 1)} title="Painted later — in front of its neighbours">↑ Front</button>
                </div>
            </section>

            <section className="map-props-section">
                <div className="map-row">
                    <button type="button" className="map-mini" onClick={() => onDuplicate(surface.id)} title="Ctrl+D">Duplicate</button>
                    <button type="button" className="map-mini" onClick={() => onCopy(surface.id)} title="Ctrl+C — hold this surface's shape and look">Copy</button>
                    <button
                        type="button"
                        className="map-mini"
                        onClick={() => onPasteShape(surface.id)}
                        disabled={!clipboard || clipboard.id === surface.id}
                        title="Corners and points from the copied surface"
                    >
                        Paste shape
                    </button>
                    <button
                        type="button"
                        className="map-mini"
                        onClick={() => onPasteLook(surface.id)}
                        disabled={!clipboard || clipboard.id === surface.id}
                        title="Source and colour from the copied surface — not its shape"
                    >
                        Paste look
                    </button>
                </div>
                {clipboard ? <p className="map-empty">Holding “{clipboard.name || clipboard.id}”.</p> : null}
            </section>
        </div>
    )
}

// A stream is named, not picked from this machine's cameras: the input lives on
// whichever machine shows the surface, and that is usually not this one. The
// suggestions are the inputs of EVERY machine showing this space, each with the
// machine it is on, and under the field the desk says who can show this name —
// so a wrong name is read here, not discovered as a black rectangle on the wall.
function MapStreamPicker({ value, machines = [], onChange }) {
    const options = streamInputOptions(machines)
    const status = streamInputStatus(machines, value)
    let note = 'Found by name on the machine that shows it — part of the name is enough.'
    let warn = false
    if (value && status.found.length) note = `On ${status.found.join(', ')}.${status.missing.length ? ` Not on ${status.missing.join(', ')}.` : ''}`
    else if (value && status.known) { note = `No machine here has an input called “${value}”.`; warn = true }
    return (
        <label className="map-field">
            <span>Input name</span>
            <input
                type="text"
                list="map-stream-inputs"
                value={value}
                placeholder="OBS Virtual Camera"
                onChange={(event) => onChange(event.target.value)}
            />
            <datalist id="map-stream-inputs">
                {options.map((option) => <option key={option.label} value={option.label}>{option.on.join(', ')}</option>)}
            </datalist>
            <p className={`map-hint${warn ? ' is-warning' : ''}`}>{note}</p>
        </label>
    )
}

// An NDI® source is named, not picked: the receiver runs on whichever machine
// shows the surface, and an NDI address is chosen by the SENDER — it advertises
// whichever of its own interfaces it likes, so nothing about an address written
// down here would still be true on the machine that draws. The suggestions are
// every source any machine on this desk can see, each with the machines that
// see it, and under the field the desk says who can show this name — so a wrong
// name is read here, not discovered as a black rectangle on the wall.
//
// THE LINK AND THE LINE ARE NOT DECORATION. di.iiii never ships the NDI
// runtime: it is proprietary, its licence cannot be passed on under the AGPL,
// and the person installs it themselves from ndi.video. The attribution and
// the link are the conditions under which we may name NDI at all — see
// docs/architecture/NDI.md. Do not remove them, and never put "NDI" in the
// name of a di.iiii feature: it describes what we speak, not what we are.
function MapNdiPicker({ value, machines = [], onChange }) {
    const options = ndiSourceOptions(machines)
    const status = ndiSourceStatus(machines, value)
    let note = 'Found by name on the machine that shows it — part of the name is enough.'
    let warn = false
    if (value && status.found.length) note = `On ${status.found.join(', ')}.${status.missing.length ? ` Not on ${status.missing.join(', ')}.` : ''}`
    else if (value && status.known) { note = `No machine here can see a source called “${value}”.`; warn = true }
    return (
        <>
            <label className="map-field">
                <span>NDI source name</span>
                <input
                    type="text"
                    list="map-ndi-sources"
                    value={value}
                    placeholder="AYLMO (td_out_windows)"
                    onChange={(event) => onChange(event.target.value)}
                />
                <datalist id="map-ndi-sources">
                    {options.map((option) => <option key={option.label} value={option.label}>{option.on.join(', ')}</option>)}
                </datalist>
                <p className={`map-hint${warn ? ' is-warning' : ''}`}>{note}</p>
            </label>
            <p className="map-hint">
                Install the NDI runtime from <a href="https://ndi.video" target="_blank" rel="noreferrer">ndi.video</a> on the machine that shows this.
                {' '}NDI® is a registered trademark of Vizrt NDI AB.
            </p>
        </>
    )
}

const formatBytes = (bytes) => {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// Bringing a file in from this machine, for a video or image surface. Uploads
// through the same project asset route Studio and the node editor use, then
// hands the asset back to the caller to both record (upsertAsset, so every
// other desk and the output window learn about it) and select (the surface's
// source.ref). Below the picker, a project's own matching assets are listed
// so a file already brought in can be re-picked without uploading it twice.
function MapFileSourceField({ kind, projectId, assets, onUpsertAsset, onChangeRef }) {
    const inputRef = useRef(null)
    const [state, setState] = useState({ busy: false, notice: '', tone: 'ok' })
    const accept = kind === 'video' ? 'video/*' : 'image/*'
    const matches = (assets || []).filter((asset) => String(asset?.mimeType || '').startsWith(`${kind}/`))

    const bringIn = async (file) => {
        if (!file) return
        if (!projectId) {
            setState({ busy: false, notice: 'Save the project before bringing in a file.', tone: 'error' })
            return
        }
        setState({ busy: true, notice: '', tone: 'ok' })
        try {
            const asset = await uploadProjectAsset(projectId, file)
            if (!asset?.id) throw new Error('The upload did not come back with a file.')
            onUpsertAsset?.(asset)
            onChangeRef(asset.url || '')
            setState({ busy: false, notice: `Brought in ${asset.name || file.name}.`, tone: 'ok' })
        } catch (error) {
            setState({ busy: false, notice: error?.message || 'Could not bring that file in.', tone: 'error' })
        }
    }

    return (
        <div className="map-field-file">
            <div className="map-row">
                <button
                    type="button"
                    className="map-mini"
                    onClick={() => inputRef.current?.click()}
                    disabled={state.busy}
                >
                    {state.busy ? 'Bringing in…' : 'Choose a file'}
                </button>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="map-field-file-input"
                onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    event.target.value = ''
                    bringIn(file)
                }}
            />
            {state.notice ? (
                <p className={`map-empty map-field-file-notice${state.tone === 'error' ? ' is-error' : ''}`}>{state.notice}</p>
            ) : null}
            {matches.length ? (
                <ul className="map-field-file-list">
                    {matches.map((asset) => (
                        <li key={asset.id}>
                            <button type="button" className="map-mini" onClick={() => onChangeRef(asset.url || '')}>
                                {asset.name}{asset.size ? ` · ${formatBytes(asset.size)}` : ''}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

// The camera list is only readable AFTER permission has been granted — before
// that the browser returns entries with empty labels, which would be a menu of
// blanks. So the picker asks first, then lists.
function MapCameraPicker({ value, onChange }) {
    const [devices, setDevices] = useState([])
    const [needsPermission, setNeedsPermission] = useState(false)

    const load = async () => {
        const media = navigator.mediaDevices
        if (!media?.enumerateDevices) return
        const list = (await media.enumerateDevices()).filter((device) => device.kind === 'videoinput')
        setDevices(list)
        setNeedsPermission(list.length > 0 && list.every((device) => !device.label))
    }

    useEffect(() => { load() }, [])

    const askPermission = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true })
            stream.getTracks().forEach((track) => track.stop())
            await load()
        } catch {
            setNeedsPermission(true)
        }
    }

    return (
        <>
            <label className="map-field">
                <span>Camera</span>
                <select value={value} onChange={(event) => onChange(event.target.value)}>
                    <option value="">Default camera</option>
                    {devices.map((device, index) => (
                        <option key={device.deviceId || index} value={device.deviceId}>
                            {device.label || `Camera ${index + 1}`}
                        </option>
                    ))}
                </select>
            </label>
            {needsPermission ? (
                <button type="button" className="map-mini" onClick={askPermission}>Name the cameras</button>
            ) : null}
        </>
    )
}

// A slider AND a number: drag for the feel, type for the value. The number is
// the one that goes on a call sheet.
function MapSlider({ label, value, min, max, step, onChange }) {
    const digits = step < 1 ? 2 : 0
    return (
        <label className="map-field map-field-slider">
            <span>{label}</span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
            <input
                type="number"
                className="map-field-number"
                min={min}
                max={max}
                step={step}
                value={Number(value).toFixed(digits)}
                aria-label={`${label} value`}
                onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
                }}
            />
        </label>
    )
}

// What the camera picture goes through before the wall sees it. The sliders
// change a running effect in place, and the change travels to every desk and
// output following this project — tune it from another machine while the
// projector keeps playing.
function MapEffectFields({ effect, onChange }) {
    const kind = effect?.kind || 'none'
    const slider = (key, label, min, max, step) => (
        <MapSlider key={key} label={label} value={effect[key]} min={min} max={max} step={step} onChange={(value) => onChange({ [key]: value })} />
    )
    return (
        <>
            <label className="map-field">
                <span>Analysis</span>
                <select value={kind} onChange={(event) => onChange({ kind: event.target.value })}>
                    <option value="none">None — the camera as it is</option>
                    <option value="motion">Motion glow — only what moves</option>
                </select>
            </label>
            {kind === 'motion' ? [
                slider('threshold', 'Ignore below', 0, 0.5, 0.01),
                slider('trail', 'Trail', 0, 0.99, 0.01),
                slider('gain', 'Glow', 0.5, 20, 0.5)
            ] : null}
        </>
    )
}
