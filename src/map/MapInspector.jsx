import { useEffect, useState } from 'react'
import { TEST_PATTERNS } from './mapTestPattern.jsx'

const SOURCE_KINDS = [
    { id: 'test', label: 'Test pattern' },
    { id: 'project', label: 'Project' },
    { id: 'url', label: 'Web page' },
    { id: 'video', label: 'Video' },
    { id: 'image', label: 'Image' },
    { id: 'camera', label: 'Camera' },
    { id: 'colour', label: 'Colour' }
]

const BLEND_MODES = ['normal', 'screen', 'multiply', 'lighten', 'add']

// Everything about one surface. Split out of the desk because the desk was
// becoming a file nobody could hold in their head at once.
export default function MapInspector({
    surface,
    projectOptions,
    clipboard,
    onUpdate,
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
                    <select value={surface.source.ref || 'grid'} onChange={(event) => setSource('test', event.target.value)}>
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

            {surface.source.kind === 'camera' ? (
                <MapCameraPicker value={surface.source.ref} onChange={(deviceId) => setSource('camera', deviceId)} />
            ) : null}

            {['url', 'video', 'image'].includes(surface.source.kind) ? (
                <label className="map-field">
                    <span>{surface.source.kind === 'url' ? 'Address' : 'File URL'}</span>
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
