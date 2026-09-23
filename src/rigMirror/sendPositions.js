import { lightingApiUrl } from '../map/lightingLink.js'
import { fixtureIndexOf } from './liveLight.js'
import { rigPlanPosition } from './rigFloor.js'

// POSITIONS GO BACK ONCE, ON A BUTTON. Step 4 of "one project is one stage"
// (di-atlas/decisions/2026-09-20-one-project-one-stage.md).
//
// The room is the place where lamps get placed by hand, and the desk keeps each
// fixture's x,y on its flat plan. This walks the floor mapping (rigFloor.js) back:
// every object with a fixture number moves the desk's fixture to where the object
// stands. One click, one request, one sentence back. It never runs on its own — the
// desk is the source of truth for the rig and the room only asks it to move once.
//
// The ONLY write the app makes to the lighting desk. POST /api/fixtures/move is the
// same route the desk's own plan uses for a drag: {moves: [{id, x, y}]}, by fixture id,
// so it is looked up from the index here and the document never learns an id.

const resolveFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl
    if (typeof fetch === 'function') return (...args) => fetch(...args)
    return null
}

// Where an object stands in the room. A child's transform is local to its parent, so
// the chain of parents is summed. Parents' rotation and scale are not applied — a lamp
// in a turned group lands where the group's offsets put it, not where the turn does;
// good enough for a plan a person will nudge, and stated rather than hidden.
export const worldPosition = (entity, byId) => {
    const out = [0, 0, 0]
    let node = entity
    let hops = 0
    while (node && hops < 64) {
        const position = node.components?.transform?.position || [0, 0, 0]
        for (let i = 0; i < 3; i++) out[i] += Number(position[i]) || 0
        node = node.parentId ? byId.get(node.parentId) : null
        hops += 1
    }
    return out
}

// The moves: one per object with a fixture number that matches a patched fixture. Two
// fixtures with the same index both move — the desk does not enforce unique indices,
// and both are the lamp the person meant. An index nobody has patched moves nothing.
export const positionMoves = (entities = [], fixtures = []) => {
    const byId = new Map(entities.map((entity) => [entity.id, entity]))
    const moves = []
    for (const entity of entities) {
        const index = fixtureIndexOf(entity)
        if (index == null) continue
        const plan = rigPlanPosition(worldPosition(entity, byId))
        for (const fixture of fixtures) {
            if (Number(fixture?.index) === index && fixture.id) moves.push({ id: fixture.id, x: plan.x, y: plan.y })
        }
    }
    return moves
}

const lampWord = (n) => `${n} lamp${n === 1 ? '' : 's'}`

// Resolves always — the sentence is the result. `present` and `fixtures` are the
// store's snapshot at the click; nothing here polls.
export async function sendPositionsToDesk({ entities = [], fixtures = [], present = false, fetchImpl } = {}) {
    if (!present) return { ok: false, moved: 0, message: 'no desk on this machine' }
    const mapped = entities.filter((entity) => fixtureIndexOf(entity) != null)
    if (!mapped.length) return { ok: false, moved: 0, message: 'no lamp has a fixture number yet' }
    const moves = positionMoves(entities, fixtures)
    if (!moves.length) return { ok: false, moved: 0, message: 'no patched fixture has those numbers' }
    const call = resolveFetch(fetchImpl)
    if (!call) return { ok: false, moved: 0, message: 'no desk on this machine' }
    try {
        const response = await call(lightingApiUrl('api/fixtures/move'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ moves })
        })
        if (!response?.ok) return { ok: false, moved: 0, message: `the desk did not take it (${response?.status ?? 'no answer'})` }
        return { ok: true, moved: moves.length, message: `${lampWord(moves.length)} moved` }
    } catch {
        return { ok: false, moved: 0, message: 'the desk did not answer' }
    }
}

export default sendPositionsToDesk
