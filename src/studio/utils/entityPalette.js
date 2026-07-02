// Single source for "what can I create" — consumed by the Create window's
// Library sections and the double-click Quick Insert popup, so the two never
// drift apart again.

export const PRIMITIVES = [
    { key: 'box', label: 'box', icon: '◻' },
    { key: 'sphere', label: 'sphere', icon: '○' },
    { key: 'cone', label: 'cone', icon: '△' },
    { key: 'cylinder', label: 'cylinder', icon: '⬡' },
    { key: 'text', label: 'text', icon: 'T' },
    { key: 'group', label: 'group', icon: '⊞' },
    { key: 'portal', label: 'portal', icon: '◎' },
]

export const LIGHTS = [
    { key: 'pointLight', label: 'Point', icon: '·' },
    { key: 'spotLight', label: 'Spot', icon: '▽' },
    { key: 'directionalLight', label: 'Directional', icon: '↘' },
    { key: 'ambientLight', label: 'Ambient', icon: '☀' },
]
