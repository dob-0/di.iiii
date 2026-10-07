import { overlayButtonStyle } from '../components/publicViewerStyles.js'
import { FORM_LIGHT_MAX, setFormLight, setViewLook, useViewLook } from './viewLook.js'

// The Look control (viewLook.js): a button, Current or Form, and under Form a Light slider.
// One component for the orbit viewer and the walk chrome, so both read and write the same per-browser store.
// The caller places it (position); this draws the button and the slider only.
export default function LookControl({ style }) {
    const viewLook = useViewLook()
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch', ...style }}>
            <button
                type="button"
                aria-pressed={viewLook.look === 'form'}
                title={viewLook.look === 'form'
                    ? 'Form: a dim environment light so steel, rust and floor keep their form. Tap for Current, the room as it was'
                    : 'Current: the room as it was drawn. Tap for Form, with a dim environment light'}
                style={{ ...overlayButtonStyle, minHeight: 44, minWidth: 104 }}
                onClick={() => setViewLook(viewLook.look === 'form' ? 'current' : 'form')}
            >
                {viewLook.look === 'form' ? 'Form' : 'Current'}
            </button>
            {viewLook.look === 'form' ? (
                <label style={{ ...overlayButtonStyle, display: 'flex', flexDirection: 'column', gap: 2, padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}>
                    Light {viewLook.light.toFixed(2)}
                    <input
                        type="range"
                        min={0}
                        max={FORM_LIGHT_MAX}
                        step={0.01}
                        value={viewLook.light}
                        aria-label="Form light"
                        onChange={(event) => setFormLight(event.target.value)}
                    />
                </label>
            ) : null}
        </div>
    )
}
