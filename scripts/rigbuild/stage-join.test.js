import { describe, it, expect } from 'vitest'
import { planJoin, joinOps, undoOps, wallPlane } from './stage-join.mjs'

const box = { id: 'platina-screen', type: 'box', components: { transform: { position: [-0.04, 1.42, 0], rotation: [0, 0, 0], scale: [4.01, 2.5, 0.1] } } }
const source = { entities: [box, { id: 'lamp-1', type: 'spotLight', components: {} }, { id: 'platina-screen-picture', type: 'image', components: {} }], mappingState: { cues: [{ id: 'c1' }, { id: 'c2' }] } }
const target = { entities: [{ id: 'mine', type: 'box', components: {} }], nodes: [{ id: 'deck' }], mappingState: { cues: [{ id: 'c1' }], surfaces: [{ id: 'out', source: { kind: 'network', ref: 'deck' } }] } }

describe('stage-join: the stage comes into the project that holds the deck (owner N3864)', () => {
    it('adds only what the target lacks, leaves the still picture out, and hangs one live wall on the output surface', () => {
        const plan = planJoin({ source, target })
        expect(plan.entities.map((e) => e.id)).toEqual(['platina-screen', 'lamp-1', 'platina-screen-live'])
        expect(plan.cues.map((c) => c.id)).toEqual(['c2'])
        expect(plan.entities[2].components.surface).toEqual({ surfaceId: 'out' })
    })
    it('the wall plane stands on the audience face, the box\'s size, and never drifts', () => {
        const p = wallPlane({ box, surfaceId: 'out' }).components
        expect(p.transform.position).toEqual([-0.04, 2.67, 0.055])
        expect(p.transform.scale).toEqual([2.005, 1, 1.25])
        expect(p.animation.mode).toBe('static')
    })
    it('a second run adds nothing, and no surface means no plane, said', () => {
        const plan = planJoin({ source, target })
        const joined = { ...target, entities: [...target.entities, ...plan.entities], mappingState: { ...target.mappingState, cues: [...target.mappingState.cues, ...plan.cues] } }
        const again = planJoin({ source, target: joined })
        expect([again.entities.length, again.cues.length]).toEqual([0, 0])
        expect(planJoin({ source, target: { ...target, mappingState: { cues: [], surfaces: [] } } }).why).toBe('the target has no network surface')
    })
    it('the undo deletes exactly what the join created', () => {
        const plan = planJoin({ source, target })
        const made = joinOps(plan)
        const undo = undoOps({ entityIds: plan.entities.map((e) => e.id), cueIds: plan.cues.map((c) => c.id) })
        expect(made.map((o) => o.type)).toEqual(['createEntity', 'createEntity', 'createEntity', 'createMappingCue'])
        expect(undo.map((o) => o.payload.entityId || o.payload.cueId)).toEqual(['platina-screen', 'lamp-1', 'platina-screen-live', 'c2'])
    })
})
