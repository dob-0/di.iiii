import { LIGHTS, PRIMITIVES } from '../../project/entityPalette.js'

// The body of the `view.library` panel node. Deliberately NOT Studio's
// LibraryPanel imported across the lane boundary: that component is styled by
// the control cluster's `.scc-*` classes, which Raw never loads, so it would
// render as a column of unstyled text here. What must not drift is the *list*
// of what can be created, and that is shared (entityPalette.js) — the markup
// is each lane's own.
export default function CreatePanelWindow({ onCreateEntity }) {
    const section = (label, items) => (
        <div className="raw-create-section">
            <div className="raw-create-label">{label}</div>
            <div className="raw-create-grid">
                {items.map(({ key, label: itemLabel, icon }) => (
                    <button
                        key={key}
                        type="button"
                        className="raw-create-btn"
                        onClick={() => onCreateEntity?.(key)}
                    >
                        <span className="raw-create-icon" aria-hidden="true">{icon}</span>
                        <span>{itemLabel}</span>
                    </button>
                ))}
            </div>
        </div>
    )

    return (
        <div className="raw-create-panel raw-window-stack">
            {section('Primitives', PRIMITIVES)}
            {section('Lights', LIGHTS)}
        </div>
    )
}
