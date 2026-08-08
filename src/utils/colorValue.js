// Port type-compatibility for `color` inputs is only enforced in the UI's
// drag gesture (RawGraphSurface.jsx) — an edge created any other way
// (project import, hand-edited API payload, an op-log replay) can wire a
// vec3-typed output straight into a color input (nodeRegistry.js declares
// them cross-compatible) with a value never intended as a color, e.g. a
// position like [8, 12, 4]. THREE.Color.set(r,g,b) doesn't validate its
// range, so that reaches the renderer as a blown-out/garish or NaN color
// instead of throwing. asColor closes the gap at the render boundary: a
// string/number passes through untouched (the normal, valid case), a
// finite 3-length array is treated as [r,g,b] and clamped to THREE.Color's
// expected 0-1 float range, and anything else falls back to a safe default.
export const asColor = (value, fallback = '#ffffff') => {
    if (typeof value === 'string' || typeof value === 'number') return value
    if (Array.isArray(value) && value.length >= 3) {
        const [r, g, b] = value
        if ([r, g, b].every((component) => Number.isFinite(Number(component)))) {
            return [r, g, b].map((component) => Math.min(1, Math.max(0, Number(component))))
        }
    }
    return fallback
}
