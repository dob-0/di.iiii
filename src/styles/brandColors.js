// The house colours, for JS that needs a value and cannot read a CSS custom
// property: an MUI theme palette, a Three.js material. Each one is a copy of a
// token in src/styles/base.css; src/styles/brandColors.test.js fails the day
// the two disagree. Anything that can take `var(--di-…)` should take that.
export const DI_CYAN = '#4df9ff' // --di-cyan
export const DI_SUCCESS = '#4df9c0' // --di-success
export const DI_SURFACE = '#0a0a0a' // --di-surface
export const DI_SURFACE_2 = '#111114' // --di-surface-2

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// A colour laid over the frame's ground at an opacity, as one opaque hex — what
// `rgba(var(--di-cyan-rgb), alpha)` looks like on --di-surface, for a material
// that ignores alpha.
export const overSurface = (hex, alpha, ground = DI_SURFACE) => {
    const top = channels(hex)
    const base = channels(ground)
    return `#${top.map((c, i) => Math.round(c * alpha + base[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`
}
