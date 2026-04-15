import { cloneValue } from '../../shared/projectSchema.js'

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

function PropertyField({ field, value, onChange, assetOptions = [] }) {
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
        return (
            <select value={value || ''} onChange={(event) => onChange(event.target.value || null)}>
                <option value="">Unassigned</option>
                {assetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                ))}
            </select>
        )
    }
    if (field.type === 'number') {
        return (
            <input
                type="number"
                value={Number.isFinite(Number(value)) ? value : 0}
                min={field.min}
                max={field.max}
                step={field.step ?? 0.1}
                onChange={(event) => onChange(Number(event.target.value))}
            />
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
    emptyMessage = 'Nothing selected yet.'
}) {
    if (!sections.length) {
        return <div className="beta-empty-state">{emptyMessage}</div>
    }

    return (
        <div className="beta-property-sheet">
            <header className="beta-property-sheet-header">
                <h4>{title}</h4>
                {subtitle ? <p>{subtitle}</p> : null}
            </header>
            {sections.map((section) => {
                const sectionValue = values[section.id] || values[section.component] || {}
                return (
                    <section key={section.id} className="beta-property-section">
                        <h5>{section.label}</h5>
                        <div className="beta-property-grid">
                            {section.fields.map((field) => {
                                const value = readNestedValue(sectionValue, field.path)
                                return (
                                    <label key={`${section.id}-${field.label}`} className="beta-property-field">
                                        <span>{field.label}</span>
                                        <PropertyField
                                            field={field}
                                            value={value}
                                            assetOptions={assetOptions}
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
    )
}
