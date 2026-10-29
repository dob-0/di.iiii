// A rig file's designed looks as view C's `components.rigLooks`, and the op that writes
// them. docs/architecture/RIG_BUILD.md §11.4. Pure: no file system, no network — the
// script (scripts/rigbuild/looks.mjs) and the cards and scenes pages' "load looks from a
// rig file" button (NextStep.jsx) run this same code, so a look loaded by hand and one
// loaded by the script are the same look.
//
// A rig file's look names a rule per GROUP (rig.groups: a fixture class on a mount).
// The cards know lamps by POSITION and TYPE, so each group is renamed to the position
// its mount rule becomes (src/rigbuild/positions.js) and its class's rental code:
// "beam380-columns" (class beam380, mount column-bases) → "column-bases/up-b380f".
// A mount with no position, or two groups landing on one key, is refused, never guessed.
import { normalizeRigLooks } from '../shared/projectSchema.js'
import { RIG_SHOW_ID } from './rental.js'
// The rig script's mount rules → view C's positions: one table, shared with the room (mountPosition.js).
import { MOUNT_POSITION } from './mountPosition.js'

const typeIdOf = (code) => String(code || '').trim().toLowerCase().replace(/\s+/g, '-')
const baseName = (file) => String(file || '').split(/[\\/]/).pop()

/** The group → `${position}/${type}` table for a rig file. Pure. */
export const groupKeys = (rig) => {
    const keys = new Map()
    const seen = new Map()
    for (const g of rig.groups || []) {
        const where = MOUNT_POSITION[g.mount]
        if (!where) throw new Error(`group ${g.id}: mount "${g.mount}" has no position in view C (MOUNT_POSITION)`)
        const code = rig.classes?.[g.class]?.code
        if (!code) throw new Error(`group ${g.id}: class "${g.class}" has no rental code`)
        const key = `${where(g)}/${typeIdOf(code)}`
        if (seen.has(key)) throw new Error(`groups ${seen.get(key)} and ${g.id} both land on ${key} — the look could not tell them apart`)
        seen.set(key, g.id)
        keys.set(g.id, key)
    }
    return keys
}

/** The rig file's looks as `components.rigLooks`. Pure. */
export const rigLooksFrom = (rig, file) => {
    const keys = groupKeys(rig)
    const rename = (byGroup) => Object.fromEntries(Object.entries(byGroup || {}).filter(([g]) => keys.has(g)).map(([g, v]) => [keys.get(g), v]))
    const value = {
        source: `${baseName(file)} (${rig.rig || 'rig'}, ${rig.writtenAt || 'undated'}) · groups renamed to position/type by scripts/rigbuild/looks.mjs`,
        writtenAt: rig.writtenAt || '',
        defaultLook: rig.defaultLook || '',
        looks: Object.entries(rig.looks || {}).map(([id, l]) => ({ id, title: l.title, intent: l.intent, aims: rename(l.aims), colours: rename(l.colours), ...(l.levels ? { levels: rename(l.levels) } : {}) }))
    }
    const out = normalizeRigLooks(value)
    if (!out || out.looks.length !== Object.keys(rig.looks || {}).length) throw new Error('the looks did not survive the schema — see normalizeRigLooks')
    return out
}

/**
 * The one op that puts `looks` on the show's entity (`rig-show`): an update when the
 * show is there, else the show is created with them. What looks.mjs sends with --api.
 */
export const rigLooksOp = (entities, looks) => (entities || []).some((e) => e?.id === RIG_SHOW_ID)
    ? { type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigLooks', patch: looks } }
    : { type: 'createEntity', payload: { entity: { id: RIG_SHOW_ID, type: 'group', name: 'the show — rental list, looks', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rigLooks: looks } } } }
