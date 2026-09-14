import { useEffect, useState, useSyncExternalStore } from 'react'
import { cloneValue } from '../../shared/projectSchema.js'
import { detectAssetMediaKind } from '../../utils/mediaAssetTypes.js'
import ScrubNumberInput from './ScrubNumberInput.jsx'
import { getModelClips, subscribeModelClips } from '../../project/viewport/modelClipRegistry.js'
import { MIDI_STATUS, useMidiOutput } from '../utils/midiCapture.js'
import { listKeeperModels } from '../utils/keeperClient.js'

const setNestedValue = (value, path, nextValue) => {
    const draft = cloneValue(value)
    let cursor = draft
    for (let index = 0; index < path.length - 1; index += 1) {
        const key = path[index]
        cursor[key] = cloneValue(cursor[key])
        cursor = cursor[key]
    }
    cursor[path[path.length - 1]] = nextValue
    return draft
}

const readNestedValue = (value, path = []) => path.reduce((current, key) => current?.[key], value)

// Narrows the phone's file chooser to what the port can actually take.
const ASSET_FIELD_ACCEPT = {
    model: '.glb,.gltf,.obj,.stl,.fbx,model/*',
    image: 'image/*',
    video: 'video/*',
    audio: 'audio/*'
}

const getAssetOptionsForField = (field, assetOptions = []) => {
    if (!field?.assetKind) return assetOptions
    return assetOptions.filter((asset) => detectAssetMediaKind(asset) === field.assetKind)
}

// A menu of clip names once a viewport has actually loaded the model file
// (src/project/viewport/modelClipRegistry.js — the same live registry
// Studio's own Clip field reads). Before that, or for a model with no
// animations, there is nothing to choose from — a text box still lets a
// name be typed by hand rather than the field going dead.
function ModelClipField({ field, value, disabled, onChange }) {
    const clips = useSyncExternalStore(subscribeModelClips, () => getModelClips(field.assetId))
    if (!clips.length) {
        return <input type="text" value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    }
    return (
        <select value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value || '')}>
            <option value="">All clips</option>
            {clips.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
    )
}

// Real device names once Web MIDI answers (a permission prompt on first ask);
// a text box otherwise, so a device id can still be typed while waiting or on
// a browser with no Web MIDI at all.
function MidiOutDeviceField({ value, disabled, onChange }) {
    const { status, devices } = useMidiOutput({ deviceId: value || '' })
    if (status !== MIDI_STATUS.ACTIVE || !devices.length) {
        return <input type="text" value={value || ''} disabled={disabled} placeholder="Every device" onChange={(event) => onChange(event.target.value)} />
    }
    return (
        <select value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value || '')}>
            <option value="">Every device</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
        </select>
    )
}

// Asks the keeper's own endpoint what it can serve (Ollama's /api/tags, then
// an OpenAI-compatible /v1/models) and offers those as a menu; a text box
// when nothing answers, because the endpoint is arbitrary — a festival GPU
// box, a laptop, nothing plugged in yet — and a name must still be settable
// by hand before anything is reachable.
function KeeperModelField({ field, value, disabled, onChange }) {
    const [models, setModels] = useState([])
    useEffect(() => {
        let alive = true
        setModels([])
        if (!field.endpoint) return undefined
        const controller = new AbortController()
        listKeeperModels(field.endpoint, { signal: controller.signal })
            .then((names) => { if (alive) setModels(names) })
            .catch(() => {})
        return () => { alive = false; controller.abort() }
    }, [field.endpoint])
    if (!models.length) {
        return <input type="text" value={value || ''} disabled={disabled} placeholder="Model name" onChange={(event) => onChange(event.target.value)} />
    }
    return (
        <select value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
            <option value="">Choose a model</option>
            {models.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
    )
}

// `disabled` is the wired case: the port reads its wire, so the box shows the
// stored value but takes nothing — the input is disabled rather than hidden,
// because a field that vanishes when a wire lands reads as a bug.
function PropertyField({ field, value, onChange, assetOptions = [], onPickAssetFile = null, disabled = false }) {
    if (field.type === 'modelClip') {
        return <ModelClipField field={field} value={value} disabled={disabled} onChange={onChange} />
    }
    if (field.type === 'midiOutDevice') {
        return <MidiOutDeviceField value={value} disabled={disabled} onChange={onChange} />
    }
    if (field.type === 'keeperModel') {
        return <KeeperModelField field={field} value={value} disabled={disabled} onChange={onChange} />
    }
    if (field.type === 'textarea') {
        return <textarea value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} rows={4} />
    }
    if (field.type === 'color') {
        // The port's real default, not white: an unset Colour on a blue cube
        // showed a white swatch while the cube stood there blue (S24 audit).
        return <input type="color" value={value || field.default || '#ffffff'} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    }
    if (field.type === 'checkbox') {
        return <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    }
    if (field.type === 'select') {
        return (
            <select value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
                {(field.options || []).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        )
    }
    if (field.type === 'asset') {
        // The picker alone only offers files that are already here, so on a
        // phone — where there is no drag-and-drop — a fresh workspace has no
        // route to a file at all. The button is that route.
        //
        // It sits on the LEFT because the floating scope button is pinned to
        // the workspace's bottom-right and, on a 390px phone, lands exactly on
        // top of a right-hand button in this row — measured, not guessed.
        return (
            <div className="raw-inspector-asset-field">
                {onPickAssetFile ? (
                    <label className="raw-inspector-asset-add" title="Bring in a file">
                        <span aria-hidden="true">＋</span>
                        <span className="raw-visually-hidden">Bring in a file</span>
                        <input
                            type="file"
                            accept={ASSET_FIELD_ACCEPT[field.assetKind] || undefined}
                            disabled={disabled}
                            onChange={(event) => {
                                const file = event.target.files?.[0]
                                event.target.value = ''
                                if (file) onPickAssetFile(file, field)
                            }}
                        />
                    </label>
                ) : null}
                <select value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value || null)}>
                    <option value="">Unassigned</option>
                    {getAssetOptionsForField(field, assetOptions).map((asset) => (
                        <option key={asset.id} value={asset.id}>{asset.name}</option>
                    ))}
                </select>
            </div>
        )
    }
    if (field.type === 'number') {
        return (
            <ScrubNumberInput
                value={value}
                fallback={Number.isFinite(Number(field.default)) ? field.default : 0}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={onChange}
                disabled={disabled}
            />
        )
    }
    if (field.type === 'vec3') {
        // A node whose values never stored this field must show — and, on a
        // single-axis edit, keep — the port's real default, not zeros. The
        // zeros were live: editing one Scale axis on such a node committed
        // [x, 0, 0] and flattened the thing to nothing ("i can't change
        // size", 2026-08-20).
        const fallback = Array.isArray(field.default) ? field.default : [0, 0, 0]
        const arr = Array.isArray(value) ? value : fallback
        return (
            <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map((axis) => (
                    <ScrubNumberInput
                        key={axis}
                        value={Number.isFinite(Number(arr[axis])) ? arr[axis] : (fallback[axis] ?? 0)}
                        fallback={fallback[axis] ?? 0}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        disabled={disabled}
                        onChange={(committed) => {
                            const next = [
                                Number.isFinite(Number(arr[0])) ? arr[0] : (fallback[0] ?? 0),
                                Number.isFinite(Number(arr[1])) ? arr[1] : (fallback[1] ?? 0),
                                Number.isFinite(Number(arr[2])) ? arr[2] : (fallback[2] ?? 0)
                            ]
                            next[axis] = committed
                            onChange(next)
                        }}
                    />
                ))}
            </div>
        )
    }
    if (field.type === 'presets' || field.type === 'modelClips') {
        // Studio-only widgets (multi-key patch / clip registry); Raw skips them
        return null
    }
    if (field.type === 'connection') {
        // The word names what actually travels on this wire (design audit
        // A1/B8): a texture carries a picture, a geometry carries a shape.
        // Inputs additionally say where it came from; outputs (readOnly)
        // just say what is leaving, since "from X" would only repeat the
        // node you are already looking at.
        const WORD_BY_PORT_TYPE = { texture: 'picture', geometry: 'shape', signal: 'signal' }
        const word = WORD_BY_PORT_TYPE[field.portType] || 'value'
        if (value == null) {
            return <span className="raw-property-connection-empty">—</span>
        }
        return (
            <span className="raw-property-connection-value">
                {field.fromLabel ? `${word} from ${field.fromLabel}` : word}
            </span>
        )
    }
    return <input type="text" value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
}

// The rename verb. It did not exist anywhere in the UI (audit 08-21: the
// schema patches `label`, but no surface ever offered it — a graph full of
// nodes named Number had no way to tell them apart). The inspector title is
// the one element every selected node already shows its name on, so the name
// is edited exactly where it is read: click, type, Enter. Same edit-buffer
// manners as ScrubNumberInput's text-edit mode — Escape abandons, blur commits.
function TitleField({ title, onRename }) {
    const [draft, setDraft] = useState(null)
    if (!onRename) return <h4>{title}</h4>
    if (draft === null) {
        return (
            <h4>
                <button
                    type="button"
                    className="raw-property-title-button"
                    title="Rename"
                    onClick={() => setDraft(title || '')}
                >
                    {title}
                </button>
            </h4>
        )
    }
    return (
        <input
            className="raw-property-title-input"
            type="text"
            value={draft}
            ref={(element) => element?.focus()}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
                const next = draft.trim()
                if (next && next !== title) onRename(next)
                setDraft(null)
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') setDraft(null)
            }}
        />
    )
}

export default function PropertyInspector({
    title,
    onRename = null,
    subtitle = '',
    sections = [],
    assetOptions = [],
    values = {},
    onSectionChange,
    onPickAssetFile = null,
    onSelectSource = null,
    emptyMessage = 'Nothing selected yet.'
}) {
    if (!sections.length) {
        return <div className="raw-empty-state">{emptyMessage}</div>
    }

    return (
        <div className="raw-property-sheet">
            <header className="raw-property-sheet-header">
                <TitleField title={title} onRename={onRename} />
                {subtitle ? <p>{subtitle}</p> : null}
            </header>
            <div className="raw-property-sections-scroll">
                {sections.map((section) => {
                    const sectionValue = values[section.id] || values[section.component] || {}
                    return (
                        <section key={section.id} className="raw-property-section">
                            <h5>{section.label}</h5>
                            <div className="raw-property-grid">
                                {section.fields.map((field) => {
                                    const value = readNestedValue(sectionValue, field.path)
                                    const isFullWidth = field.type === 'textarea' || field.type === 'select' || field.type === 'asset'
                                        || field.type === 'modelClip' || field.type === 'midiOutDevice' || field.type === 'keeperModel'
                                    const wired = field.wired === true
                                    const readOnly = field.readOnly === true
                                    // Wired, with a resolved source: "from <label>" is the whole
                                    // point of A3/B8 — say what it is AND go there. Wired with no
                                    // resolvable source (the source node vanished, or this render
                                    // ran before RawEditor could resolve it) falls back to the old
                                    // plain "wired" word rather than a broken-looking blank.
                                    const wiredTag = wired ? (
                                        field.fromNodeId && onSelectSource ? (
                                            <button
                                                type="button"
                                                className="raw-property-wired raw-property-wired-button"
                                                title={`Go to ${field.fromLabel || 'the source node'}`}
                                                onClick={(event) => {
                                                    event.preventDefault()
                                                    onSelectSource(field.fromNodeId)
                                                }}
                                            >
                                                {`from ${field.fromLabel || 'a node'}`}
                                            </button>
                                        ) : (
                                            <em className="raw-property-wired">{field.fromLabel ? `from ${field.fromLabel}` : 'wired'}</em>
                                        )
                                    ) : null
                                    return (
                                        <label
                                            key={`${section.id}-${field.label}`}
                                            className={`raw-property-field${field.type === 'checkbox' ? ' raw-checkbox-field' : ''}${isFullWidth ? ' raw-full-width-field' : ''}${wired ? ' is-wired' : ''}${readOnly ? ' is-readonly' : ''}`}
                                            title={wired
                                                ? 'This port takes its value from the wire into it. Unplug the wire to type one.'
                                                : (readOnly ? 'This is a live output — wire from it to use the value elsewhere.' : undefined)}
                                        >
                                            <span>
                                                {field.label}
                                                {wiredTag}
                                            </span>
                                            <PropertyField
                                                field={field}
                                                value={value}
                                                assetOptions={assetOptions}
                                                onPickAssetFile={onPickAssetFile}
                                                disabled={wired || readOnly}
                                                onChange={(nextValue) => {
                                                    const nextSectionValue = setNestedValue(sectionValue, field.path, nextValue)
                                                    onSectionChange?.(field.component || section.id, nextSectionValue)
                                                }}
                                            />
                                        </label>
                                    )
                                })}
                            </div>
                        </section>
                    )
                })}
            </div>
        </div>
    )
}
