import { LIGHTS, PRIMITIVES } from '../../../project/entityPalette.js'
import { ColorField } from './fields.jsx'

export function LibraryPanel({ onCreateEntity, primitives = PRIMITIVES, lights = LIGHTS }) {
    return (
        <>
            <div className="scc-section">
                <div className="scc-section-label">Primitives</div>
                <div className="scc-buttons">
                    {primitives.map(({ key, label }) => (
                        <button key={key} className="scc-btn" onClick={() => onCreateEntity(key)}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {lights.length > 0 && (
                <div className="scc-section">
                    <div className="scc-section-label">Lights</div>
                    <div className="scc-buttons">
                        {lights.map(({ key, label }) => (
                            <button key={key} className="scc-btn" onClick={() => onCreateEntity(key)}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

// Which room Studio is standing in: the whole room (Studio's own objects), or
// the inside of one of the project's Geos (owner's decision 2026-10-02, "edit
// inside the Geo"). Inside a Geo, Create puts things into it and Objects lists
// what stands in it — the same nodes Nodes shows. Existing classes only: the
// section and its label, the inspector's own select, the small button.
export function GeoSwitcher({ geos = [], currentGeoId = null, onOpenGeo, onNewGeo }) {
    if (!geos.length && !currentGeoId) return null
    return (
        <div className="scc-section">
            <div className="scc-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Geo</span>
                {onNewGeo ? (
                    <button type="button" className="scc-btn scc-btn--xs" onClick={onNewGeo} title="A new, empty Geo in the room — Studio opens inside it">+ Geo</button>
                ) : null}
            </div>
            <select
                className="insp-select"
                aria-label="Geo"
                value={currentGeoId || ''}
                onChange={(event) => onOpenGeo?.(event.target.value || null)}
            >
                <option value="">Whole room</option>
                {geos.map((geo) => (
                    <option key={geo.id} value={geo.id}>{geo.label}</option>
                ))}
            </select>
        </div>
    )
}

// Jam mode's whole inspector: the two edits a first-timer actually wants —
// their text and its color — plus Remove. Everything routes through the same
// updateComponent patch pipeline as the full inspector (merge semantics), so
// flipping to "All tools" later shows the exact same values.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export function JamEditPanel({ entity, onInspectorChange, onDeleteSelected }) {
    if (!entity) {
        return <p className="sfp-empty">Tap an object to edit it.</p>
    }
    const textValue = entity.components?.text?.value ?? ''
    const appearance = entity.components?.appearance
    const colorValue = HEX_COLOR.test(appearance?.color || '') ? appearance.color : '#ffffff'
    return (
        <>
            {entity.type === 'text' && (
                <div className="insp-field">
                    <label className="insp-label" htmlFor={`jam-text-${entity.id}`}>Your text</label>
                    <textarea
                        id={`jam-text-${entity.id}`}
                        className="insp-input"
                        rows={3}
                        value={textValue}
                        onChange={(event) => onInspectorChange?.('text', { value: event.target.value })}
                    />
                </div>
            )}
            {appearance && (
                <ColorField
                    label="Colour"
                    value={colorValue}
                    onChange={(next) => onInspectorChange?.('appearance', { color: next })}
                />
            )}
            {onDeleteSelected && (
                <div className="scc-section">
                    <div className="scc-buttons">
                        <button className="scc-btn" onClick={onDeleteSelected}>✕ Remove</button>
                    </div>
                </div>
            )}
        </>
    )
}
