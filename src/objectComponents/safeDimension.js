// Guards an authored primitive dimension (radius/height/width/tube/…) before
// it reaches a THREE.js geometry constructor. Schema normalization
// (src/shared/projectSchema.js normalizeEntity) only clamps primitive.size
// (a vector) — scalar fields like radius/height are passed through
// unclamped, and importLegacyScene.js's `object.sphereRadius || 0.5` lets a
// negative value through `||` unchanged (only 0/NaN/undefined fall back).
// A negative/NaN/zero arg produces a degenerate or invisible mesh with no
// visible error. Mirrors BoxObject.jsx's existing inline `safeSize` guard.
export function safeDimension(value, fallback) {
    const next = Math.abs(Number(value))
    if (!Number.isFinite(next)) return fallback
    return Math.min(100, Math.max(0.001, next))
}
