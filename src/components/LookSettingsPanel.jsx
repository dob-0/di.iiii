import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { GAME_PRESETS, cmPer360, degreesPerCount, edpi, presetYaw } from './lookSensitivity.js'
import {
    getLookSettings,
    resetLookSettings,
    setLookSettings,
    subscribeLookSettings
} from './lookSettings.js'
import { LOOK_FOV_MAX, LOOK_FOV_MIN } from './walkModeConfig.js'

// Horizontal FOV at 16:9 for a vertical FOV — the number game menus show.
const horizontalFov = (vDeg) =>
    (2 * Math.atan(Math.tan((vDeg * Math.PI) / 360) * (16 / 9)) * 180) / Math.PI

const fmt = (n, digits) => (Number.isFinite(n) ? n.toFixed(digits) : '—')

// The walk-mode Look switch: one small chrome button in the bottom-left corner
// (the same control as the header's Sound switch) that opens a panel of the
// viewer's own look settings. Desktop only — it is about the mouse — and only
// while the pointer is free (LiveProjectScene decides that).
export default function LookSettingsPanel() {
    const settings = useSyncExternalStore(subscribeLookSettings, getLookSettings, getLookSettings)
    const [open, setOpen] = useState(false)
    const rootRef = useRef(null)
    const id = useId()

    // Draft text for the two number fields so a half-typed "1." is not
    // clamped away under the typist's fingers; committed on every valid parse.
    const [sensText, setSensText] = useState(String(settings.sens))
    const [dpiText, setDpiText] = useState(String(settings.dpi))
    // Re-sync only when the stored value really differs from what is typed
    // (a reset, another tab) — "1." parses to 1 and must keep its dot.
    useEffect(() => { setSensText((t) => (Number(t) === settings.sens ? t : String(settings.sens))) }, [settings.sens])
    useEffect(() => { setDpiText((t) => (Number(t) === settings.dpi ? t : String(settings.dpi))) }, [settings.dpi])

    useEffect(() => {
        if (!open) return undefined
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const yaw = presetYaw(settings.game)
    const cm = cmPer360(settings.sens, yaw, settings.dpi)

    const commitNumber = (key, text, setText) => {
        setText(text)
        const n = Number(text)
        if (text.trim() !== '' && Number.isFinite(n) && n > 0) setLookSettings({ [key]: n })
    }

    return (
        <span className="live-scene-look" ref={rootRef}>
            <button
                type="button"
                className="live-scene-sound"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={`${id}-panel`}
                title="Mouse sensitivity, field of view, invert Y, head bob"
            >
                Look
            </button>
            {open ? (
                <div id={`${id}-panel`} className="live-scene-look-panel" role="dialog" aria-label="Look settings">
                    <label className="live-scene-look-row">
                        <span>Game</span>
                        <select value={settings.game} onChange={(e) => setLookSettings({ game: e.target.value })}>
                            {Object.entries(GAME_PRESETS).map(([key, p]) => (
                                <option key={key} value={key}>{p.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="live-scene-look-row">
                        <span>Sens</span>
                        <input
                            type="number" inputMode="decimal" min="0.001" step="0.01"
                            value={sensText}
                            onChange={(e) => commitNumber('sens', e.target.value, setSensText)}
                            onBlur={() => setSensText(String(settings.sens))}
                        />
                    </label>
                    <label className="live-scene-look-row">
                        <span>Mouse DPI</span>
                        <input
                            type="number" inputMode="numeric" min="100" max="32000" step="50"
                            value={dpiText}
                            onChange={(e) => commitNumber('dpi', e.target.value, setDpiText)}
                            onBlur={() => setDpiText(String(settings.dpi))}
                        />
                    </label>
                    <p className="live-scene-look-readout" aria-live="polite">
                        {fmt(cm, 1)} cm / 360 · eDPI {fmt(edpi(settings.sens, settings.dpi), 0)} · {fmt(degreesPerCount(settings.sens, yaw), 4)}° per count
                    </p>
                    <label className="live-scene-look-row">
                        <span>FOV</span>
                        <input
                            type="range" min={LOOK_FOV_MIN} max={LOOK_FOV_MAX} step="1"
                            value={settings.fov}
                            onChange={(e) => setLookSettings({ fov: Number(e.target.value) })}
                        />
                        <output>{fmt(settings.fov, 0)}° · {fmt(horizontalFov(settings.fov), 0)}° wide</output>
                    </label>
                    <label className="live-scene-look-row live-scene-look-row--check">
                        <input
                            type="checkbox" checked={settings.invertY}
                            onChange={(e) => setLookSettings({ invertY: e.target.checked })}
                        />
                        <span>Invert Y</span>
                    </label>
                    <label className="live-scene-look-row live-scene-look-row--check">
                        <input
                            type="checkbox" checked={settings.headBob}
                            onChange={(e) => setLookSettings({ headBob: e.target.checked })}
                        />
                        <span>Head bob</span>
                    </label>
                    <p className="live-scene-look-note">
                        cm / 360 holds with the system&apos;s pointer acceleration off.
                    </p>
                    <button type="button" className="live-scene-sound" onClick={() => resetLookSettings()}>
                        Reset
                    </button>
                </div>
            ) : null}
        </span>
    )
}
