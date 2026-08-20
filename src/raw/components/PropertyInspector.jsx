import { cloneValue } from '../../shared/projectSchema.js'
import { detectAssetMediaKind } from '../../utils/mediaAssetTypes.js'

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

function PropertyField({ field, value, onChange, assetOptions = [], onPickAssetFile = null }) {
    if (field.type === 'textarea') {
        return <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} rows={4} />
    }
    if (field.type === 'color') {
        return <input type="color" value={value || '#ffffff'} onChange={(event) => onChange(event.target.value)} />
    }
    if (field.type === 'checkbox') {
        return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
    }
    if (field.type === 'select') {
        return (
            <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
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
                            onChange={(event) => {
                                const file = event.target.files?.[0]
                                event.target.value = ''
                                if (file) onPickAssetFile(file, field)
                            }}
                        />
                    </label>
                ) : null}
                <select value={value || ''} onChange={(event) => onChange(event.target.value || null)}>
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
            <input
                type="number"
                value={Number.isFinite(Number(value)) ? value : (Number.isFinite(Number(field.default)) ? field.default : 0)}
                min={field.min}
                max={field.max}
                step={field.step ?? 0.1}
                onChange={(event) => onChange(Number(event.target.value))}
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
                    <input
                        key={axis}
                        type="number"
                        value={Number.isFinite(Number(arr[axis])) ? arr[axis] : (fallback[axis] ?? 0)}
                        step={field.step ?? 0.1}
                        style={{ width: '100%', minWidth: 0 }}
                        onChange={(event) => {
                            const next = [
                                Number.isFinite(Number(arr[0])) ? arr[0] : (fallback[0] ?? 0),
                                Number.isFinite(Number(arr[1])) ? arr[1] : (fallback[1] ?? 0),
                                Number.isFinite(Number(arr[2])) ? arr[2] : (fallback[2] ?? 0)
                            ]
                            next[axis] = Number(event.target.value)
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
        return (
            <span style={{ opacity: 0.6, fontSize: '0.8em' }}>
                {value == null ? '—' : 'connected'}
            </span>
        )
    }
    return <input type="text" value={value || ''} onChange={(event) => onChange(event.target.value)} />
}

export default function PropertyInspector({
    title,
    subtitle = '',
    sections = [],
    assetOptions = [],
    values = {},
    onSectionChange,
    onPickAssetFile = null,
    emptyMessage = 'Nothing selected yet.'
}) {
    if (!sections.length) {
        return <div className="raw-empty-state">{emptyMessage}</div>
    }

    return (
        <div className="raw-property-sheet">
            <header className="raw-property-sheet-header">
                <h4>{title}</h4>
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
                                    return (
                                        <label
                                            key={`${section.id}-${field.label}`}
                                            className={`raw-property-field${field.type === 'checkbox' ? ' raw-checkbox-field' : ''}${isFullWidth ? ' raw-full-width-field' : ''}`}
                                        >
                                            <span>{field.label}</span>
                                            <PropertyField
                                                field={field}
                                                value={value}
                                                assetOptions={assetOptions}
                                                onPickAssetFile={onPickAssetFile}
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
