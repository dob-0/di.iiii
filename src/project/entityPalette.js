// Single source for "what can I create" — consumed by Studio's Create window,
// the double-click Quick Insert popup, and Raw's `view.library` panel node, so
// the three never drift apart again. Lives in the shared project layer rather
// than under src/studio/ for exactly that last reason: both lanes create the
// same entities into the same document.

export const PRIMITIVES = [
    { key: 'box', label: 'box', icon: '◻' },
    { key: 'sphere', label: 'sphere', icon: '○' },
    { key: 'cone', label: 'cone', icon: '△' },
    { key: 'cylinder', label: 'cylinder', icon: '⬡' },
    { key: 'plane', label: 'plane', icon: '▭' },
    { key: 'torus', label: 'torus', icon: '◯' },
    { key: 'capsule', label: 'capsule', icon: '⬭' },
    { key: 'ring', label: 'ring', icon: '⊙' },
    { key: 'text', label: 'text', icon: 'T' },
    { key: 'group', label: 'group', icon: '⊞' },
    { key: 'portal', label: 'portal', icon: '◎' },
]

// A Screen is a plane that shows the live deck (made by studio/utils/screenOps.js).
// Not in PRIMITIVES: Raw's palettes and cards read that list and a Screen is a
// Studio-room object (it needs the mapping surface the room shares).
export const SCREEN_ENTRY = { key: 'screen', label: 'Screen', icon: '▭' }

export const LIGHTS = [
    { key: 'pointLight', label: 'Point', icon: '·' },
    { key: 'spotLight', label: 'Spot', icon: '▽' },
    { key: 'directionalLight', label: 'Directional', icon: '↘' },
    { key: 'ambientLight', label: 'Ambient', icon: '☀' },
]

// Jam mode's reduced palette (see utils/jamMode.js): the shapes a first-timer
// recognizes instantly. Derived from PRIMITIVES so labels/icons never drift.
const JAM_PRIMITIVE_KEYS = ['box', 'sphere', 'cone', 'torus', 'text']
export const JAM_PRIMITIVES = PRIMITIVES.filter(({ key }) => JAM_PRIMITIVE_KEYS.includes(key))
