import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { VIEW_SETTINGS, resetViewSettings, setViewSetting, useViewSettings } from './viewSettings.js'
import { FORM_LIGHT_MAX, setFormLight, setViewLook, useViewLook } from './viewLook.js'
import { NAVIGATION_PRESETS, NAVIGATION_PRESET_IDS } from '../../studio/navigation/mappings.js'
import { setNavigationPreference, useNavigationPreference } from '../../studio/navigation/preference.js'

// The viewer's settings, all in one place (viewSettings.js), named and grouped as Blender's Preferences > Navigation and the viewport
// sidebar's View tab: Navigation (the preset), Orbit & Pan, Zoom, Clip, Look. Per browser; nothing here writes the project.
// One component, two surfaces: the public viewer's right column and Studio's Display group.
// Dressed with the di.iiii tokens (src/styles/base.css): --di-surface-2, --di-line, --di-cyan, --di-text-muted, --di-mono, --di-radius (2 px,
// rectangles only), 44 px targets.
const css = {
    panel: {
        // above the scene's title banner (it scrolled over the title and the close button on a 390 px phone, measured 2026-10-08); a 0.5 rem gutter keeps it on the screen
        position: 'fixed', top: '0.5rem', right: '0.5rem', zIndex: 1000, boxSizing: 'border-box', width: 'min(23rem, calc(100vw - 1rem))', maxHeight: 'calc(100dvh - 1rem)', overflowY: 'auto', overscrollBehavior: 'contain',
        background: 'var(--di-surface-2, #111114)', border: '1px solid var(--di-line, rgba(77,249,255,0.12))', borderRadius: 'var(--di-radius, 2px)',
        color: 'var(--di-text, #fff)', padding: '0.9rem 1rem 1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'var(--di-sans, system-ui, sans-serif)', fontSize: '0.85rem', lineHeight: 1.35
    },
    eyebrow: { margin: '1rem 0 0.3rem', fontFamily: 'var(--di-mono, monospace)', fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--di-cyan, #4df9ff)' },
    row: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0.15rem 0.6rem', minHeight: 44, padding: '0.2rem 0', borderBottom: '1px solid var(--di-line, rgba(77,249,255,0.12))' },
    hint: { gridColumn: '1 / -1', color: 'var(--di-text-muted, rgba(255,255,255,0.5))', fontSize: '0.74rem' },
    value: { fontFamily: 'var(--di-mono, monospace)', color: 'var(--di-cyan, #4df9ff)', fontVariantNumeric: 'tabular-nums' },
    btn: { appearance: 'none', border: '1px solid var(--di-cyan-border, rgba(77,249,255,0.3))', background: 'var(--di-cyan-dim, rgba(77,249,255,0.1))', color: 'var(--di-text, #fff)', borderRadius: 'var(--di-radius, 2px)', padding: '0.5rem 0.8rem', minHeight: 44, cursor: 'pointer', fontSize: '0.85rem' },
    range: { gridColumn: '1 / -1', width: '100%', height: 28, margin: '4px 0', accentColor: 'var(--di-cyan, #4df9ff)', touchAction: 'pan-y' }
}

const fmt = (spec, v) => {
    const n = Number(v)
    const text = spec.max > 1000 ? n.toLocaleString('en-US') : spec.step < 0.1 ? n.toFixed(2) : spec.step < 1 ? n.toFixed(1) : String(Math.round(n))
    return spec.unit ? `${text} ${spec.unit}` : text
}

function SettingRow({ spec, value }) {
    const id = useId()
    if (spec.type === 'toggle') {
        return (
            <div style={css.row}>
                <label htmlFor={id}>{spec.label}</label>
                <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => setViewSetting(spec.key, e.target.checked)} style={{ width: 28, height: 28, accentColor: 'var(--di-cyan, #4df9ff)' }} />
                {spec.hint ? <span style={css.hint}>{spec.hint}</span> : null}
            </div>
        )
    }
    return (
        <div style={css.row}>
            <label htmlFor={id}>{spec.label}</label>
            <output htmlFor={id} style={css.value}>{fmt(spec, value)}</output>
            <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step} value={value} style={css.range} onChange={(e) => setViewSetting(spec.key, e.target.value)} />
            {spec.hint ? <span style={css.hint}>{spec.hint}</span> : null}
        </div>
    )
}

// The keys the VIEW level shows before "More settings" (the rest wait behind it, in place).
export const VIEW_LEVEL_KEYS = Object.freeze(['zoomSpeed', 'smoothViewMs', 'invertWheel'])

function MouseMapping() {
    const nav = useNavigationPreference()
    const presetId = nav?.preset || 'studio'
    const preset = NAVIGATION_PRESETS[presetId] || NAVIGATION_PRESETS.studio
    return (
        <div style={css.row}>
            <span>Mouse mapping</span>
            <span style={{ display: 'flex', gap: 4 }}>
                {NAVIGATION_PRESET_IDS.map((id) => (
                    <button key={id} type="button" aria-pressed={presetId === id} onClick={() => setNavigationPreference(id)}
                        style={{ ...css.btn, background: presetId === id ? 'var(--di-cyan-dim, rgba(77,249,255,0.1))' : 'transparent', borderColor: presetId === id ? 'var(--di-cyan, #4df9ff)' : 'var(--di-line, rgba(77,249,255,0.12))' }}>
                        {NAVIGATION_PRESETS[id].label}
                    </button>
                ))}
            </span>
            <span style={css.hint}>{preset.description}</span>
            {preset.rows ? <span style={{ ...css.hint, fontFamily: 'var(--di-mono, monospace)' }}>{preset.rows.map(([k, v]) => `${k}: ${v}`).join('  ·  ')}</span> : null}
        </div>
    )
}

function LookControls({ eyebrow = true }) {
    const look = useViewLook()
    return (
        <div>
            {eyebrow ? <div style={css.eyebrow}>Look</div> : null}
            <div style={css.row}>
                <span>Environment light</span>
                <button type="button" aria-pressed={look.look === 'form'} style={css.btn} onClick={() => setViewLook(look.look === 'form' ? 'current' : 'form')}>
                    {look.look === 'form' ? 'Form' : 'Current'}
                </button>
                <span style={css.hint}>Current is the scene as drawn. Form adds a dim environment light so steel, rust and floor keep their form.</span>
            </div>
            {look.look === 'form' ? (
                <div style={css.row}>
                    <label htmlFor="vs-form-light">Light</label>
                    <output htmlFor="vs-form-light" style={css.value}>{look.light.toFixed(2)}</output>
                    <input id="vs-form-light" type="range" min={0} max={FORM_LIGHT_MAX} step={0.01} value={look.light} style={css.range} onChange={(e) => setFormLight(e.target.value)} />
                </div>
            ) : null}
        </div>
    )
}

/**
 * level="view"   -- for anyone who opens a link: Look, Zoom Speed, Smooth View, Invert wheel, Mouse mapping, Reset, and "More settings"
 *                   which swaps in the full list in place.
 * level="studio" -- everything, grouped: Navigation, Orbit & Pan, Zoom, Clip, Look.
 * Both read and write the same stores (viewSettings.js, viewLook.js, navigation preference).
 */
export function ViewSettingsPanel({ onClose, level = 'studio' }) {
    const settings = useViewSettings()
    const [more, setMore] = useState(false)
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])
    const compact = level === 'view' && !more
    const groups = [...new Set(VIEW_SETTINGS.map((s) => s.group))]
    return (
        <section role="dialog" aria-label="View settings" data-level={level} style={css.panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.95rem' }}>{level === 'view' ? 'View' : 'View settings'}</strong>
                <button type="button" style={{ ...css.btn, minWidth: 44, padding: '0.3rem 0.6rem' }} onClick={onClose} aria-label="Close view settings">×</button>
            </div>
            <div style={css.hint}>Yours, in this browser. The project is not changed.</div>

            {compact ? (
                <>
                    <LookControls />
                    <div style={css.eyebrow}>Move</div>
                    {VIEW_SETTINGS.filter((s) => VIEW_LEVEL_KEYS.includes(s.key)).map((s) => <SettingRow key={s.key} spec={s} value={settings[s.key]} />)}
                    <MouseMapping />
                </>
            ) : (
                <>
                    <div style={css.eyebrow}>Navigation</div>
                    <MouseMapping />
                    {groups.map((g) => (
                        <div key={g}>
                            <div style={css.eyebrow}>{g}</div>
                            {VIEW_SETTINGS.filter((s) => s.group === g).map((s) => <SettingRow key={s.key} spec={s} value={settings[s.key]} />)}
                        </div>
                    ))}
                    <LookControls />
                </>
            )}
            <div style={{ marginTop: '0.9rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={css.btn} onClick={resetViewSettings}>Reset to defaults</button>
                {level === 'view' ? (
                    <button type="button" style={css.btn} aria-expanded={more} onClick={() => setMore((v) => !v)}>{more ? 'Fewer settings' : 'More settings'}</button>
                ) : null}
            </div>
        </section>
    )
}

/** A button that opens the panel. `style`/`className` let each surface dress it. */
export default function ViewSettingsButton({ className, style, label = 'Settings', level = 'studio' }) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <button type="button" className={className} style={style} aria-haspopup="dialog" aria-expanded={open} title="Navigation, zoom, clip and look settings" onClick={() => setOpen((v) => !v)}>
                {label}
            </button>
            {/* in document.body: the viewer's own layers (the title banner, z 20 in a higher stacking context) drew over a panel rendered inside them */}
            {open && typeof document !== 'undefined' ? createPortal(<ViewSettingsPanel level={level} onClose={() => setOpen(false)} />, document.body) : null}
        </>
    )
}
