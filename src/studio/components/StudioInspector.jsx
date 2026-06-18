import { useCallback, useEffect, useRef, useState } from 'react'
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

function InspNumber({ field, value, onChange, compact = false, axisColor }) {
    const baseStep = field.step ?? 0.1
    const fieldMin = field.min ?? -Infinity
    const fieldMax = field.max ?? Infinity
    const num = Number.isFinite(Number(value)) ? Number(value) : 0
    const intervalRef = useRef(null)
    const inputRef = useRef(null)

    // Keep latest values accessible inside stable listeners
    const stateRef = useRef({ num, baseStep, fieldMin, fieldMax, onChange })
    useEffect(() => { stateRef.current = { num, baseStep, fieldMin, fieldMax, onChange } })

    const resolveStep = (e) => {
        const s = stateRef.current.baseStep
        if (e.shiftKey) return s / 10
        if (e.ctrlKey || e.metaKey) return s * 10
        return s
    }

    const applyDelta = useCallback((dir, s) => {
        const { num: n, fieldMin: lo, fieldMax: hi, onChange: cb } = stateRef.current
        cb(Math.min(hi, Math.max(lo, parseFloat((n + dir * s).toFixed(10)))))
    }, [])

    // Hold-to-repeat for arrow buttons
    const startRepeat = (dir) => {
        applyDelta(dir, stateRef.current.baseStep)
        intervalRef.current = setInterval(() => applyDelta(dir, stateRef.current.baseStep), 80)
    }
    const stopRepeat = () => { clearInterval(intervalRef.current) }

    // Keyboard arrows with modifier step
    const handleKeyDown = (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        applyDelta(e.key === 'ArrowUp' ? 1 : -1, resolveStep(e))
    }

    // Non-passive scroll wheel (needs direct DOM listener)
    useEffect(() => {
        const el = inputRef.current
        if (!el) return
        const onWheel = (e) => {
            if (document.activeElement !== el) return
            e.preventDefault()
            const s = stateRef.current.baseStep
            const step = e.shiftKey ? s / 10 : (e.ctrlKey || e.metaKey) ? s * 10 : s
            applyDelta(e.deltaY < 0 ? 1 : -1, step)
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [applyDelta])

    return (
        <div className={compact ? 'insp-field insp-field--compact' : 'insp-field'}>
            <label className="insp-label" style={axisColor ? { color: axisColor } : undefined}>{field.label}</label>
            <div className="insp-num-wrap">
                <input
                    ref={inputRef}
                    type="number"
                    className="insp-input insp-num-input"
                    value={num}
                    min={field.min}
                    max={field.max}
                    step={baseStep}
                    onChange={(e) => {
                        const v = Number(e.target.value)
                        stateRef.current.onChange(Math.min(fieldMax, Math.max(fieldMin, v)))
                    }}
                    onKeyDown={handleKeyDown}
                />
                <div className="insp-num-arrows">
                    <button className="insp-num-btn" onPointerDown={() => startRepeat(1)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat} tabIndex={-1}>▲</button>
                    <button className="insp-num-btn" onPointerDown={() => startRepeat(-1)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat} tabIndex={-1}>▼</button>
                </div>
            </div>
        </div>
    )
}

const AXIS_SUFFIXES = ['X', 'Y', 'Z']
const AXIS_COLOR_VARS = ['var(--axis-x)', 'var(--axis-y)', 'var(--axis-z)']

const groupVectorFields = (fields = []) => {
    const groups = []
    let i = 0
    while (i < fields.length) {
        const field = fields[i]
        const base = field?.type === 'number' ? field.label?.match(/^(.+) X$/)?.[1] : null
        const next1 = fields[i + 1]
        const next2 = fields[i + 2]
        if (
            base &&
            next1?.label === `${base} Y` && next1.component === field.component &&
            next2?.label === `${base} Z` && next2.component === field.component
        ) {
            groups.push({ vector: true, base, fields: [field, next1, next2] })
            i += 3
        } else {
            groups.push({ vector: false, field })
            i += 1
        }
    }
    return groups
}

function InspSlider({ field, value, onChange }) {
    const num = Number.isFinite(Number(value)) ? Number(value) : field.min
    const pct = ((num - field.min) / (field.max - field.min)) * 100
    return (
        <div className="insp-field">
            <div className="insp-slider-header">
                <label className="insp-label">{field.label}</label>
                <span className="insp-slider-value">{num}</span>
            </div>
            <input
                type="range"
                className="insp-slider"
                value={num}
                min={field.min}
                max={field.max}
                step={field.step ?? 0.1}
                onChange={(e) => onChange(Number(e.target.value))}
                style={{ '--insp-slider-fill': `${pct}%` }}
            />
        </div>
    )
}

const isBoundedNumber = (field) => field.type === 'number' && Number.isFinite(field.min) && Number.isFinite(field.max)

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

    if (field.type === 'number') {
        return isBoundedNumber(field)
            ? <InspSlider field={field} value={value} onChange={onChange} />
            : <InspNumber field={field} value={value} onChange={onChange} />
    }

    return (
        <div className="insp-field">
            <label className="insp-label">{field.label}</label>
            <input
                type="text"
                className="insp-input"
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
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
                    {groupVectorFields(section.fields).map((group) => group.vector ? (
                        <div className="insp-vec3-group" key={`${section.id}-${group.base}`}>
                            <label className="insp-label">{group.base}</label>
                            <div className="insp-vec3-row">
                                {group.fields.map((field, axisIndex) => (
                                    <InspNumber
                                        key={field.label}
                                        compact
                                        axisColor={AXIS_COLOR_VARS[axisIndex]}
                                        field={{ ...field, label: AXIS_SUFFIXES[axisIndex] }}
                                        value={readNestedValue(sectionValue, field.path)}
                                        onChange={(nextValue) => {
                                            const next = setNestedValue(sectionValue, field.path, nextValue)
                                            onSectionChange?.(field.component || section.id, next)
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <InspField
                            key={`${section.id}-${group.field.label}`}
                            field={group.field}
                            value={readNestedValue(sectionValue, group.field.path)}
                            assetOptions={assetOptions}
                            onChange={(nextValue) => {
                                const next = setNestedValue(sectionValue, group.field.path, nextValue)
                                onSectionChange?.(group.field.component || section.id, next)
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
