// The viewer's choice of mouse navigation for the 3D viewport. Lives in the
// help dialog's Shortcuts tab, right above the mouse rows it changes.
import { useEffect, useRef, useState } from 'react'
import { NAVIGATION_PRESETS, NAVIGATION_PRESET_IDS } from '../navigation/mappings.js'

export default function NavigationPreferenceControl({ preset, orbitSelection, onPresetChange, onOrbitSelectionChange }) {
    const [status, setStatus] = useState('')
    const changed = useRef(false)

    useEffect(() => {
        if (!changed.current) return
        const label = NAVIGATION_PRESETS[preset]?.label || preset
        setStatus(`Mouse navigation: ${label}.${preset === 'blender' && orbitSelection ? ' Orbit around selection on.' : ''}`)
    }, [preset, orbitSelection])

    return (
        <fieldset className="sh-nav-pref">
            <legend className="sh-nav-pref-legend">Mouse navigation</legend>
            {NAVIGATION_PRESET_IDS.map((id) => {
                const item = NAVIGATION_PRESETS[id]
                const descId = `sh-nav-pref-desc-${id}`
                return (
                    <label key={id} className="sh-nav-pref-option" htmlFor={`sh-nav-pref-${id}`}>
                        {item.label}{id === 'studio' ? ' (default)' : ''}
                        <input
                            id={`sh-nav-pref-${id}`}
                            type="radio"
                            name="studio-navigation-preset"
                            value={id}
                            checked={preset === id}
                            aria-describedby={descId}
                            onChange={() => { changed.current = true; onPresetChange(id) }}
                        />
                        <span className="sh-nav-pref-text">
                            <span id={descId}>{item.description}</span>
                        </span>
                    </label>
                )
            })}
            {preset === 'blender' && (
                <label className="sh-nav-pref-option sh-nav-pref-option--sub" htmlFor="sh-nav-pref-orbit-selection">
                    Orbit around selection
                    <input
                        id="sh-nav-pref-orbit-selection"
                        type="checkbox"
                        checked={orbitSelection}
                        onChange={(event) => { changed.current = true; onOrbitSelectionChange(event.target.checked) }}
                    />
                    <span className="sh-nav-pref-text">
                        <span>Turn around what you selected instead of the surface under the pointer.</span>
                    </span>
                </label>
            )}
            <p className="sh-nav-pref-status" role="status" aria-live="polite">{status}</p>
        </fieldset>
    )
}
