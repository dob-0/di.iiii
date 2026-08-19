// The dispersion sphere's live parameters.
//
// WHY A MUTABLE MODULE OBJECT AND NOT REACT STATE. These are dragged, and a
// slider drag is a continuous stream of values. Putting them in state would
// re-render the tree — including <Canvas>, which sits under the same root — on
// every pixel of every drag, and R3F would re-apply the camera while the author
// is trying to judge motion. The sequence reads this object inside useFrame,
// which already runs every frame and needs no re-render to see a new number.
// The panel owns its own copy for the input values and writes through.
//
// The cost of that trade is honest and worth stating: nothing here is
// persisted, and nothing re-renders when it changes. Reload and the sphere is
// back at the defaults below — which is the same contract the director panel's
// edit list has, and for the same reason. What gets approved is what is
// written down in the source, not what somebody left a slider on.

/**
 * Ranges are the author's, not the shader's. Several of these produce a
 * technically valid image well outside the stated bounds — `speed` at 8 is a
 * strobing mess rather than an error — so the sliders describe the range the
 * scene was designed in, and the clamp keeps a stray drag from landing
 * somewhere that looks broken.
 */
export const DISPERSION_RANGES = {
    // How fast the whole field evolves. The brief is "slow, graceful
    // explosion", and everything above about 0.8 stops reading as graceful.
    speed: { min: 0.02, max: 1.5, step: 0.01 },
    // Detail in the fluid — the wispy filaments that make ink read as ink.
    // At 0 the surface is smooth blobs; past ~1.6 the filaments get fine
    // enough to alias, which is the one thing a headset cannot forgive.
    turbulence: { min: 0, max: 2, step: 0.01 },
    // How hard the radial waves push colour out from their sources. This is
    // the "explosion" knob: at 0 the colour sits and stirs, at 2 it visibly
    // erupts and dissolves.
    expansion: { min: 0, max: 2, step: 0.01 },
    // Overall colour strength. Not brightness of the light in the room —
    // that follows from it, see the sphere's own lamp.
    colorIntensity: { min: 0, max: 2, step: 0.01 },
    // Size of the noise field ON the sphere, independent of the sphere's
    // physical size. Low is a few enormous slow masses; high is many small
    // ones. This is the knob that decides whether the sphere reads as
    // monumental or as a marble, more than the radius does.
    fluidScale: { min: 0.3, max: 4, step: 0.01 },
    // Strength of the additive glow shells standing off the surface. Named
    // bloom because that is what it is for; it is not a post-process — see
    // DispersionSphere.jsx for why not.
    bloom: { min: 0, max: 2, step: 0.01 },
    /**
     * How much of the sphere's colour the halo and the room light keep.
     *
     * 0 is white, 1 is the sphere's own hue at full strength. It defaults low
     * on direction — a coloured halo over a coloured sphere leaves nothing in
     * the frame that is NOT the colour, so there is no rest anywhere and the
     * sphere stops being the thing that is coloured. White surround, coloured
     * object: the colour has somewhere to be read against.
     */
    haloTint: { min: 0, max: 1, step: 0.01 },
    /**
     * The column strobe. A pulse of colour runs down the colonnade one column
     * at a time during one window of the scene — see STROBE_WINDOW.
     *
     * 0 turns it off entirely, which is the honest way to audition it: this is
     * the one hard event in an otherwise continuous scene and it needs to be
     * judged against its own absence.
     */
    strobe: { min: 0, max: 2, step: 0.01 },
    // Radius in metres. 5.5 puts the bottom of the sphere just above eye
    // height at its resting position, which is what makes it monumental
    // rather than large.
    sphereSize: { min: 1, max: 12, step: 0.1 },
    /**
     * 0 = the piece's own iridescence, 1 = full spectrum. Continuous rather
     * than a switch so the two can be crossfaded and judged against each
     * other instead of argued about.
     *
     * FULL SPECTRUM BREAKS THE PIECE'S COLOUR LAW, deliberately and on the
     * artist's brief. palette.js holds the whole work to two hue bands
     * (195–215° and 350–40°) with no green, yellow or purple in between; a
     * seamless rainbow walks through all three. This is the one place in the
     * installation that can do that, it is opt-in, and it defaults to 1
     * because the brief asked for rainbow. Drag it to 0 to see the same motion
     * inside the palette.
     */
    spectrum: { min: 0, max: 1, step: 0.01 }
}

export const DISPERSION_DEFAULTS = {
    speed: 0.35,
    turbulence: 0.85,
    expansion: 1,
    colorIntensity: 1,
    fluidScale: 1.4,
    bloom: 0.8,
    haloTint: 0.18,
    strobe: 1,
    sphereSize: 5.5,
    spectrum: 1
}

export const DISPERSION_KEYS = Object.keys(DISPERSION_DEFAULTS)

/**
 * Clamp a value into its declared range, rejecting anything non-finite.
 *
 * A range input hands back a string, and an empty one hands back '' which
 * becomes NaN. NaN in a uniform does not throw — it propagates silently
 * through the shader and the sphere turns black, which is indistinguishable
 * from a compile failure and sends you reading GLSL for an hour.
 */
export const clampControl = (key, value) => {
    const range = DISPERSION_RANGES[key]
    if (!range) return value

    // Number('') is 0, not NaN — and so are Number(null) and Number(false).
    // A finite-check alone therefore accepts an emptied input as a deliberate
    // zero and clamps it into range, which for `bloom` or `colorIntensity`
    // silently turns the sphere off and looks exactly like a broken shader.
    // Only a number or a non-blank string is a value at all.
    const usable = typeof value === 'number'
        || (typeof value === 'string' && value.trim() !== '')
    if (!usable) return DISPERSION_DEFAULTS[key]

    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return DISPERSION_DEFAULTS[key]
    return Math.min(range.max, Math.max(range.min, numeric))
}

/** A full, clamped parameter set — every key present, defaults where absent. */
export const normaliseControls = (partial = {}) =>
    DISPERSION_KEYS.reduce((out, key) => {
        out[key] = clampControl(key, partial[key] ?? DISPERSION_DEFAULTS[key])
        return out
    }, {})

/**
 * The live values. Read every frame by the sequence, written by the panel.
 * Exported as an object rather than through a getter so the read in useFrame
 * is a property access and nothing else.
 */
export const dispersionControls = normaliseControls()

export const setDispersionControl = (key, value) => {
    if (!(key in DISPERSION_RANGES)) return dispersionControls[key]
    dispersionControls[key] = clampControl(key, value)
    return dispersionControls[key]
}

export const resetDispersionControls = () => {
    Object.assign(dispersionControls, normaliseControls())
    return dispersionControls
}

/**
 * The current values as source you can paste back into DISPERSION_DEFAULTS —
 * the same move the director panel's "Copy edit list" makes, and for the same
 * reason: the sliders are for finding a value, the file is for keeping it.
 */
export const dispersionSource = (values = dispersionControls) =>
    `${DISPERSION_KEYS
        .map((key) => `    ${key}: ${Number(values[key].toFixed(3))}`)
        .join(',\n')}`
