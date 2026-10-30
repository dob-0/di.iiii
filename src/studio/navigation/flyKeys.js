// The fly keys: which keys take the walker up and down while flying. A person picks it beside "Mouse in Edit" (Scene -> Move, and the
// public viewer's Move card), kept per browser like the other navigation settings (preference.js FLY_KEYS_STORAGE_KEY).
//   standard  E up, Q down (default, owner 2026-10-29 N1445.1): Unity, Unreal, Roblox Studio and Blender agree (docs/ai/keys.md).
//   classic   Q up, E down: the pair di.iiii had from 2026-06-20 to 2026-10-29, kept as a mode (owner: "what we have never lose").
// Space (up) and C (down) work in both.
import { HINT_SEPARATOR } from '../../components/walkKeys.js'

export const FLY_KEYS_IDS = Object.freeze(['standard', 'classic'])
export const DEFAULT_FLY_KEYS = 'standard'
export const FLY_KEYS_LABEL = 'Fly up and down'
export const FLY_KEYS = Object.freeze([
    Object.freeze({ id: 'standard', label: 'E up, Q down', about: 'The same as Unity, Unreal, Roblox Studio and Blender. Space also goes up, C also goes down.', keys: Object.freeze({ up: Object.freeze([' ', 'e']), down: Object.freeze(['q', 'c']) }), codes: Object.freeze({ up: 'KeyE', down: 'KeyQ' }) }),
    Object.freeze({ id: 'classic', label: 'Q up, E down', about: 'The pair di.iiii had before. Space also goes up, C also goes down.', keys: Object.freeze({ up: Object.freeze([' ', 'q']), down: Object.freeze(['e', 'c']) }), codes: Object.freeze({ up: 'KeyQ', down: 'KeyE' }) }),
])

export function normalizeFlyKeys(value) {
    return FLY_KEYS_IDS.includes(value) ? value : DEFAULT_FLY_KEYS
}

export const flyKeysFor = (id) => FLY_KEYS.find((f) => f.id === normalizeFlyKeys(id))

/** The { up, down } key tokens (physicalKey.js) for a choice. Pure. */
export const altitudeKeysFor = (id) => flyKeysFor(id).keys

/**
 * The hint words for the altitude keys: "Space/E · up · C/Q · down". `label(code, fallback)` may give the visitor's own letter.
 * @param {string} id
 * @param {(code: string, fallback: string) => string} [label]
 */
export function altitudeHintTextFor(id, label = (_code, fallback) => fallback) {
    const { codes } = flyKeysFor(id)
    const up = label(codes.up, codes.up.slice(3))
    const down = label(codes.down, codes.down.slice(3))
    return `Space/${up} · up` + HINT_SEPARATOR + `${label('KeyC', 'C')}/${down} · down`
}
