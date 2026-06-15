import { useState } from 'react'
import { cloneValue } from '../../shared/projectSchema.js'

const setNestedValue = (value, path, nextValue) => {
    const draft = cloneValue(value)
    let cursor = draft
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i]
        cursor[key] = cloneValue(cursor[key])
        cursor = cursor[key]
    }
    cursor[path[path.length - 1]] = nextValue
    return draft
}

const readNestedValue = (value, path = []) =>
    path.reduce((cur, key) => cur?.[key], value)

function InspField({ field, value, assetOptions = [], onChange }) {
    if (field.type === 'checkbox') {
        return (
            <label className="insp-toggle">
                <input
                    type="checkbox"
                    className="insp-toggle-input"
                    checked={Boolean(value)}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <span className="insp-toggle-track">
                    <span className="insp-toggle-thumb" />
                </span>
                <span className="insp-toggle-label">{field.label}</span>
            </label>
        )
    }

    if (field.type === 'color') {
        return (
            <div className="insp-field">
                <label className="insp-label">{field.label}</label>
                <input
                    type="color"
                    className="insp-color"
                    value={value || '#ffffff'}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        )
    }

    if (field.type === 'select' || field.type === 'asset') {
        const options = field.type === 'asset'
            ? [{ value: '', label: 'Unassigned' }, ...assetOptions.map((a) => ({ value: a.id, label: a.name }))]
            : (field.options || [])
        return (
            <div className="insp-field">
                <label className="insp-label">{field.label}</label>
                <select
                    className="insp-select"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value || null)}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        )
    }

    if (field.type === 'textarea') {
        return (
            <div className="insp-field">
                <label className="insp-label">{field.label}</label>
                <textarea
                    className="insp-textarea"
                    rows={4}
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        )
    }

    const isNum = field.type === 'number'
    return (
        <div className="insp-field">
            <label className="insp-label">{field.label}</label>
            <input
                type={isNum ? 'number' : 'text'}
                className="insp-input"
                value={isNum && !Number.isFinite(Number(value)) ? 0 : (value ?? '')}
                min={isNum ? field.min : undefined}
                max={isNum ? field.max : undefined}
                step={isNum ? (field.step ?? 0.1) : undefined}
                onChange={(e) => onChange(isNum ? Number(e.target.value) : e.target.value)}
            />
        </div>
    )
}

function InspSection({ section, sectionValue, assetOptions, onSectionChange }) {
    const [open, setOpen] = useState(true)
    return (
        <div className="insp-section">
            <button className="insp-section-btn" onClick={() => setOpen((v) => !v)}>
                <span className="scc-section-label">{section.label}</span>
                <span className="insp-arrow">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <div className="insp-section-body">
                    {section.fields.map((field) => (
                        <InspField
                            key={`${section.id}-${field.label}`}
                            field={field}
                            value={readNestedValue(sectionValue, field.path)}
                            assetOptions={assetOptions}
                            onChange={(nextValue) => {
                                const next = setNestedValue(sectionValue, field.path, nextValue)
                                onSectionChange?.(field.component || section.id, next)
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default function StudioInspector({
    title,
    subtitle = '',
    sections = [],
    assetOptions = [],
    values = {},
    onSectionChange,
    footer = null,
    emptyMessage = 'Select an entity to edit it.',
}) {
    if (!sections.length) {
        return (
            <div className="insp-empty">
                <p className="sfp-empty">{emptyMessage}</p>
            </div>
        )
    }

    return (
        <div className="insp-root">
            <div className="insp-header">
                <span className="insp-title">{title}</span>
                {subtitle ? <span className="insp-subtitle">{subtitle}</span> : null}
            </div>

            {sections.map((section) => {
                const sectionValue = values[section.id] || values[section.component] || {}
                return (
                    <InspSection
                        key={section.id}
                        section={section}
                        sectionValue={sectionValue}
                        assetOptions={assetOptions}
                        onSectionChange={onSectionChange}
                    />
                )
            })}

            {footer && <div className="insp-footer">{footer}</div>}
        </div>
    )
}
