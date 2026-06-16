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

function InspNumber({ field, value, onChange }) {
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
        <div className="insp-field">
            <label className="insp-label">{field.label}</label>
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
        return <InspNumber field={field} value={value} onChange={onChange} />
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
