// Blender's Clear Location / Rotation / Scale (Alt+G / Alt+R / Alt+S; manual: Scene Layout › Object ›
// Transform › Clear). Owner 2026-10-13, arranging a rig by hand: a lamp turned the wrong way wants one
// key back to its rest, not three fields typed to zero. Pure; the editor dispatches the ops.
import { isLockedEntity } from './selectionTools.js'

const REST = { location: ['position', [0, 0, 0]], rotation: ['rotation', [0, 0, 0]], scale: ['scale', [1, 1, 1]] }
const KEY_OF = { g: 'location', r: 'rotation', s: 'scale' }

/**
 * 'location' | 'rotation' | 'scale' | null for a keydown. Alt only (Ctrl/Cmd/Shift never). Matched by
 * the key's place as well as its letter: on macOS Alt+G types '©', on the Armenian layout G is 'գ'.
 */
export function clearFromKey(event) {
    if (!event?.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
    const code = /^Key([GRS])$/.exec(event.code || '')
    const letter = code ? code[1].toLowerCase() : String(event.key || '').toLowerCase()
    return KEY_OF[letter] || null
}

/** One updateComponent op per selected, unlocked entity not already at rest — one batch, one undo step. */
export function clearTransformOps(entities = [], ids = [], which = 'location') {
    const rest = REST[which]
    if (!rest) return []
    const [field, value] = rest
    const wanted = new Set(ids || [])
    return (entities || [])
        .filter((entity) => wanted.has(entity.id) && !isLockedEntity(entity))
        .filter((entity) => {
            const current = entity.components?.transform?.[field]
            return !Array.isArray(current) || current.some((v, i) => v !== value[i])
        })
        .map((entity) => ({
            type: 'updateComponent',
            payload: { entityId: entity.id, component: 'transform', patch: { [field]: [...value] } }
        }))
}
