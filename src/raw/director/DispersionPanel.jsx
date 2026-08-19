import { useCallback, useState } from 'react'
import {
    DISPERSION_DEFAULTS,
    DISPERSION_KEYS,
    DISPERSION_RANGES,
    dispersionControls,
    dispersionSource,
    resetDispersionControls,
    setDispersionControl
} from '../../algoVrithm/dispersionControls.js'

// The dispersion sphere's controls. Author-only, mounted alongside the director
// panel and behind the same H toggle — it is authoring furniture, and an
// audience has nothing to turn.
//
// WHY IT IS NOT PART OF DirectorPanel.jsx. The director panel is about the
// piece: which beat owns which seconds, where a clip sits, what the room's
// lights are. These knobs belong to ONE sequence's material. Folding them in
// would make the panel's shape depend on which clip the playhead is over, and
// would put a second live session's edits and this file's in the same shared
// component — the concurrent-editing hazard this repo hits repeatedly.
//
// Values are held twice on purpose: React state here so the inputs are
// controlled and the panel is a normal form, and the plain module object in
// dispersionControls.js for the render loop to read. See that file for why the
// scene must not re-render on a drag.

const LABELS = {
    speed: 'speed',
    turbulence: 'turbulence',
    expansion: 'expansion',
    colorIntensity: 'colour intensity',
    fluidScale: 'fluid scale',
    bloom: 'bloom',
    haloTint: 'halo tint',
    strobe: 'column strobe',
    sphereSize: 'sphere size',
    spectrum: 'spectrum'
}

// Shown under the slider rather than as a tooltip. The author reads this while
// dragging, and half the time on a device with no hover — the same reasoning
// the XR diagnostics line in AlgoVrithmExperience is rendered rather than
// title-attributed.
const HINTS = {
    spectrum: '0 = palette iridescence · 1 = full spectrum (breaks the two-band colour rule, on brief)',
    bloom: 'additive glow shells, not a post-process — also drives how hard the sphere lights the room',
    fluidScale: 'size of the pattern ON the sphere, independent of the sphere itself',
    haloTint: '0 = white halo and white room · 1 = the sphere’s own colour spilling everywhere',
    strobe: 'a pulse running the colonnade one column at a time, partway through the scene'
}

export default function DispersionPanel() {
    const [values, setValues] = useState(() => ({ ...dispersionControls }))
    const [copied, setCopied] = useState(false)

    // CLOSED by default. These sliders are about 200px tall inside an editor
    // row that is 45% of the window — open, they take half the cutting room for
    // a control the author tunes once and then leaves alone, and the clip rows
    // sit permanently below the fold.
    //
    // The grid stays MOUNTED and is hidden in CSS rather than unmounted: the
    // values are module state, so dropping the inputs would leave the panel and
    // the sphere silently disagreeing the next time it was scrubbed to.
    const [open, setOpen] = useState(false)

    const change = useCallback((key, raw) => {
        const applied = setDispersionControl(key, raw)
        setValues((previous) => ({ ...previous, [key]: applied }))
        setCopied(false)
    }, [])

    const reset = useCallback(() => {
        setValues({ ...resetDispersionControls() })
        setCopied(false)
    }, [])

    const copy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(dispersionSource())
            setCopied(true)
        } catch {
            // Clipboard access is refused in plenty of legitimate contexts —
            // an insecure LAN origin, which is exactly how this gets opened on
            // a phone. Failing silently would look like the button is broken.
            setCopied(false)
        }
    }, [])

    return (
        <section className={`algo-vrithm-dispersion${open ? '' : ' is-collapsed'}`}>
            <header>
                <button
                    type="button"
                    className="algo-vrithm-dispersion-collapse"
                    aria-expanded={open}
                    aria-label={open ? 'Hide dispersion sphere controls' : 'Show dispersion sphere controls'}
                    onClick={() => setOpen((previous) => !previous)}
                >
                    {open ? '▾' : '▸'}
                </button>
                <span>dispersion sphere</span>
                <span className="algo-vrithm-dispersion-actions">
                    <button type="button" onClick={reset}>Reset</button>
                    <button type="button" onClick={copy}>
                        {copied ? 'Copied ✓' : 'Copy values'}
                    </button>
                </span>
            </header>

            <div className="algo-vrithm-dispersion-grid">
                {DISPERSION_KEYS.map((key) => {
                    const range = DISPERSION_RANGES[key]
                    const isDefault = values[key] === DISPERSION_DEFAULTS[key]
                    return (
                        <label key={key} className="algo-vrithm-dispersion-row">
                            <span className="algo-vrithm-dispersion-name">
                                {LABELS[key]}
                                {/* Marks what has been moved off the committed
                                    value. Without it a panel full of sliders
                                    gives no way to tell a deliberate setting
                                    from a stray drag. */}
                                {!isDefault && <em> ·</em>}
                            </span>
                            <input
                                type="range"
                                min={range.min}
                                max={range.max}
                                step={range.step}
                                value={values[key]}
                                onChange={(event) => change(key, event.target.value)}
                            />
                            <output>{Number(values[key].toFixed(2))}</output>
                            {HINTS[key] && (
                                <small className="algo-vrithm-dispersion-hint">
                                    {HINTS[key]}
                                </small>
                            )}
                        </label>
                    )
                })}
            </div>
        </section>
    )
}
