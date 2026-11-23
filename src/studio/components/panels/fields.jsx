import { formatNumberDisplay } from '../../utils/formatNumberDisplay.js'
import { useState } from 'react'

const clampNumber = (value, min, max) => {
    let next = value
    if (Number.isFinite(min)) next = Math.max(min, next)
    if (Number.isFinite(max)) next = Math.min(max, next)
    return next
}

function NumberBox({ value, onChange, min, max, step = 1 }) {
    const [draft, setDraft] = useState(null)
    const bump = (dir) => {
        const current = Number.isFinite(Number(value)) ? Number(value) : 0
        onChange(clampNumber(parseFloat((current + dir * step).toFixed(10)), min, max))
    }
    return (
        <div className="insp-num-wrap">
            <input
                type="number"
                className="insp-input insp-num-input"
                value={draft ?? formatNumberDisplay(value)}
                min={min}
                max={max}
                step={step}
                onFocus={(event) => setDraft(event.target.value)}
                onBlur={() => setDraft(null)}
                onChange={(event) => {
                    setDraft(event.target.value)
                    const next = Number(event.target.value)
                    if (event.target.value !== '' && Number.isFinite(next)) onChange(clampNumber(next, min, max))
                }}
            />
            <div className="insp-num-arrows">
                <button type="button" className="insp-num-btn" onClick={() => bump(1)} tabIndex={-1}>▲</button>
                <button type="button" className="insp-num-btn" onClick={() => bump(-1)} tabIndex={-1}>▼</button>
            </div>
        </div>
    )
}

export function NumberField({ label, value, onChange, min, max, step = 1 }) {
    return (
        <div className="insp-field">
            <label className="insp-label">{label}</label>
            <NumberBox value={value} onChange={onChange} min={min} max={max} step={step} />
        </div>
    )
}

const AXIS_COLOR_VARS = ['var(--axis-x)', 'var(--axis-y)', 'var(--axis-z)']

export function MiniRow({ fields }) {
    return (
        <div className="insp-vec3-row">
            {fields.map((field, index) => {
                const color = field.color ?? (field.axis ? AXIS_COLOR_VARS[index] : undefined)
                return (
                    <div className="insp-field insp-field--compact" key={field.label}>
                        <label className="insp-label" style={color ? { color } : undefined}>{field.label}</label>
                        <NumberBox value={field.value} onChange={field.onChange} min={field.min} max={field.max} step={field.step ?? 1} />
                    </div>
                )
            })}
        </div>
    )
}

export function SliderField({ label, value, onChange, min, max, step }) {
    const pct = ((value - min) / (max - min)) * 100
    return (
        <div className="insp-field">
            <div className="insp-slider-header">
                <label className="insp-label">{label}</label>
                <span className="insp-slider-value">{value}</span>
            </div>
            <input
                type="range"
                className="insp-slider"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => onChange(Number(event.target.value))}
                style={{ '--insp-slider-fill': `${pct}%` }}
            />
        </div>
    )
}

export function ColorField({ label, value, onChange }) {
    return (
        <div className="insp-field">
            <label className="insp-label">{label}</label>
            <input type="color" className="insp-color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        </div>
    )
}

export function ToggleField({ label, checked, onChange }) {
    return (
        <label className="insp-toggle">
            <input type="checkbox" className="insp-toggle-input" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            <span className="insp-toggle-track">
                <span className="insp-toggle-thumb" />
            </span>
            <span className="insp-toggle-label">{label}</span>
        </label>
    )
}

export function CollapsibleSection({ title, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="insp-section">
            <button className="insp-section-btn" onClick={() => setOpen((v) => !v)}>
                <span className="scc-section-label">{title}</span>
                <span className="insp-arrow">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <div className="insp-section-body">
                    {children}
                </div>
            )}
        </div>
    )
}
