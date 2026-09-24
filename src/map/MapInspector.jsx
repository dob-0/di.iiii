import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TEST_PATTERN, TEST_PATTERNS } from './mapTestPattern.jsx'
import { ndiSourceOptions, ndiSourceStatus, streamInputOptions, streamInputStatus } from './mapMachines.js'
import { uploadProjectAsset } from '../project/services/projectsApi.js'

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

// Everything about one surface. Split out of the desk because the desk was
// becoming a file nobody could hold in their head at once.
export default function MapInspector({
    surface,
    projectId,
    assets = [],
    projectOptions,
    pictureOutOptions = [],
    machines = [],
    clipboard,
    onUpdate,
    onUpsertAsset,
    onDelete,
    onDuplicate,
    onCopy,
    onPasteShape,
    onPasteLook,
    onMaskFromOutline,
    onResetCorners
}) {
    if (!surface) return <p className="map-empty">Pick a surface to change what it shows.</p>

    const setSource = (kind, ref = '') => onUpdate(surface.id, { source: { kind, ref } })

    return (
        <>
            <div className="map-panel-head">
                <h2>{surface.name || surface.id}</h2>
                <button type="button" className="map-mini is-danger" onClick={() => onDelete(surface.id)}>Delete</button>
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
                <span aria-hidden="true">x</span>
                <input
                    type="number"
                    min="1"
                    value={surface.resolution[1]}
                    onChange={(event) => onUpdate(surface.id, { resolution: [surface.resolution[0], Number(event.target.value) || 1] })}
                />
            </label>

            <MapSlider label="Opacity" value={surface.opacity} min={0} max={1} step={0.01} onChange={(value) => onUpdate(surface.id, { opacity: value })} />
            <MapSlider label="Brightness" value={surface.brightness} min={0} max={2} step={0.01} onChange={(value) => onUpdate(surface.id, { brightness: value })} />
            <MapSlider label="Contrast" value={surface.contrast} min={0} max={2} step={0.01} onChange={(value) => onUpdate(surface.id, { contrast: value })} />
            <MapSlider label="Saturation" value={surface.saturation} min={0} max={3} step={0.01} onChange={(value) => onUpdate(surface.id, { saturation: value })} />
            <MapSlider label="Hue" value={surface.hue} min={-180} max={180} step={1} onChange={(value) => onUpdate(surface.id, { hue: value })} />

            <label className="map-field">
                <span>Blend</span>
                <select value={surface.blend} onChange={(event) => onUpdate(surface.id, { blend: event.target.value })}>
                    {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
            </label>

            <div className="map-section">
                <div className="map-panel-head"><h2>Shape</h2></div>
                <div className="map-row">
                    <button
                        type="button"
                        className="map-mini"
                        onClick={() => onMaskFromOutline(surface.id)}
                        title="Start the mask as the surface's own rectangle, then pull its corners in"
                    >
                        Mask from outline
                    </button>
                    <button type="button" className="map-mini" onClick={() => onUpdate(surface.id, { mask: [] })} disabled={!surface.mask.length}>
                        Clear mask
                    </button>
                    <button type="button" className="map-mini" onClick={() => onResetCorners(surface.id)}>Reset corners</button>
                </div>
            </div>

            <div className="map-section">
                <div className="map-panel-head"><h2>Copy</h2></div>
                <div className="map-row">
                    <button type="button" className="map-mini" onClick={() => onDuplicate(surface.id)}>Duplicate</button>
                    <button type="button" className="map-mini" onClick={() => onCopy(surface.id)} title="Hold this surface's shape and look">Copy</button>
                    <button
                        type="button"
                        className="map-mini"
                        onClick={() => onPasteShape(surface.id)}
                        disabled={!clipboard || clipboard.id === surface.id}
                        title="Corners and mask from the copied surface"
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
            </div>
        </>
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

function MapSlider({ label, value, min, max, step, onChange }) {
    return (
        <label className="map-field map-field-slider">
            <span>{label}</span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
            <output>{Number(value).toFixed(step < 1 ? 2 : 0)}</output>
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
