// The Studio camera panel: lens (field of view), how fast the view moves, and where
// it turns. Opens from the view label at the bottom-left of a viewport pane. Speeds
// and "turn around the pointer" are per-device (navigation/cameraSettings.js); the
// lens belongs to the view and is saved with "save view".
import { useEffect, useRef, useState } from 'react'
import {
    FOV_RANGE, LENS_PRESETS_MM, SPEED_RANGE, clampFov, fovToLensMm, lensMmToFov, useCameraSettings,
} from '../navigation/cameraSettings.js'

const SPEEDS = [
    ['zoomSpeed', 'Zoom speed'],
    ['orbitSpeed', 'Orbit speed'],
    ['panSpeed', 'Pan speed'],
]

export default function CameraPanel({ label, ortho, getFov, onFov, onFrame }) {
    const [open, setOpen] = useState(false)
    const { settings, update, reset } = useCameraSettings()
    const rootRef = useRef(null)
    // The lens is read off the live camera (a fixed shot, a smart-view preset or this panel
    // may have set it), twice a second.
    const [, tick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => tick((n) => n + 1), 500)
        return () => clearInterval(id)
    }, [])
    const fov = getFov()

    useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const lens = Math.round(fovToLensMm(fov))
    return (
        <div className="svl-cam" ref={rootRef}>
            <button
                type="button"
                className="svl-cam-toggle"
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen((v) => !v)}
                title="Camera: lens, speed, where the view turns"
            >
                {label}{ortho ? ' · Ortho' : ` · ${lens} mm`} <span aria-hidden="true">{open ? '▾' : '▴'}</span>
            </button>
            {open && (
                <div className="svl-cam-panel" role="dialog" aria-label="Camera settings">
                    <div className="svl-cam-row svl-cam-row--buttons">
                        <button type="button" onClick={() => onFrame('frame-all')} title="Home">Frame all</button>
                        <button type="button" onClick={() => onFrame('frame-selected')} title="F">Frame selected</button>
                    </div>

                    <div className="svl-cam-group">Lens</div>
                    <label className="svl-cam-row">
                        <span>Field of view</span>
                        <input
                            type="range"
                            min={FOV_RANGE.min}
                            max={FOV_RANGE.max}
                            step={1}
                            value={Math.round(clampFov(fov))}
                            disabled={ortho}
                            onChange={(event) => onFov(clampFov(Number(event.target.value)))}
                        />
                        <output>{Math.round(fov)}° · {lens} mm</output>
                    </label>
                    <div className="svl-cam-row svl-cam-row--buttons" role="group" aria-label="Lens presets">
                        {LENS_PRESETS_MM.map((mm) => (
                            <button
                                key={mm}
                                type="button"
                                disabled={ortho}
                                aria-pressed={Math.abs(lens - mm) <= 1}
                                onClick={() => onFov(clampFov(lensMmToFov(mm)))}
                            >
                                {mm} mm
                            </button>
                        ))}
                    </div>
                    {ortho && <p className="svl-cam-note">Orthographic views have no lens. Drag to orbit and you are back in perspective.</p>}

                    <div className="svl-cam-group">Movement</div>
                    {SPEEDS.map(([key, text]) => (
                        <label key={key} className="svl-cam-row">
                            <span>{text}</span>
                            <input
                                type="range"
                                min={SPEED_RANGE.min}
                                max={SPEED_RANGE.max}
                                step={0.05}
                                value={settings[key]}
                                onChange={(event) => update({ [key]: Number(event.target.value) })}
                            />
                            <output>{settings[key].toFixed(2)}×</output>
                        </label>
                    ))}
                    <label className="svl-cam-row svl-cam-row--check">
                        <input
                            type="checkbox"
                            checked={settings.pointerPivot}
                            onChange={(event) => update({ pointerPivot: event.target.checked })}
                        />
                        <span>Turn and zoom around the point under the pointer</span>
                    </label>
                    <label className="svl-cam-row svl-cam-row--check">
                        <input
                            type="checkbox"
                            checked={settings.keepAboveFloor}
                            onChange={(event) => update({ keepAboveFloor: event.target.checked })}
                        />
                        <span>Keep the camera above the floor</span>
                    </label>
                    <div className="svl-cam-row svl-cam-row--buttons">
                        <button type="button" onClick={reset}>Reset speeds</button>
                    </div>
                </div>
            )}
        </div>
    )
}
