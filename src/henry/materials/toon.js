import * as THREE from 'three'

// The look, in one file.
//
// The references are flat. Not "low-poly flat" — *painted* flat: a shape holds
// one colour across most of its face and turns to a second, cooler value only
// at the very edge of the form. MeshToonMaterial with a hand-built gradient
// map is the cheapest thing in three.js that does exactly that, and it is
// closer to the target than any amount of MeshStandardMaterial tuning, which
// always ends up looking like a lit plastic toy under a studio light.
//
// Three ramp stops, not the usual two, and the step positions are uneven:
// most of the form stays lit, the turn is late and quick. That is the
// difference between "painted" and "cel-shaded cartoon".

let cachedRamp = null

export const toonRamp = () => {
    if (cachedRamp) return cachedRamp
    // Values are multipliers on the material colour, so the ramp is greyscale.
    // 208 rather than 255 at the top: a fully-lit stop blows the colour out to
    // white at grazing angles and the palette loses its warmth.
    const stops = new Uint8Array([88, 150, 208])
    const texture = new THREE.DataTexture(stops, stops.length, 1, THREE.RedFormat)
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    cachedRamp = texture
    return texture
}

export const disposeToonRamp = () => {
    cachedRamp?.dispose()
    cachedRamp = null
}
