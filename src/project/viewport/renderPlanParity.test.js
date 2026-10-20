import { describe, expect, it } from 'vitest'
import { isArchitectureEntity, isRigEntity } from './smartView/smartViewGeometry.js'
import { isShowThing } from '../../shared/renderPlan.js'

// src/shared/renderPlan.js keeps its own copy of the rig / building rules (src/shared may not import src/project): the two
// must agree, or Tech would drop a lamp the smart view calls rig.
const CASES = [
    { id: 'place-hall', type: 'model', name: 'MOXIR hall' },
    { id: 'venue', type: 'model', name: 'x', components: { venuePlan: {} } },
    { id: 'authored', type: 'box', name: 'shell', components: { viewRole: 'architecture' } },
    { id: 'not-arch', type: 'model', name: 'hall model', components: { viewRole: 'prop' } },
    { id: 'spot', type: 'spotLight', name: 'PAR' },
    { id: 'point', type: 'pointLight', name: 'bulb' },
    { id: 'fixture', type: 'model', name: 'head', components: { fixture: { type: 'beam' } } },
    { id: 'beam', type: 'group', name: 'b', components: { beam: {} } },
    { id: 'piece', type: 'model', name: 'truss', components: { piece: {} } },
    { id: 'warehouse', type: 'model', name: 'old warehouse scan' },
    { id: 'press', type: 'model', name: 'Press 1890' },
    { id: 'video', type: 'video', name: 'LED content' }
]

describe('renderPlan isShowThing agrees with smartViewGeometry', () => {
    it('every rig entity and every building is a show thing; nothing else is, except floor names and cameras', () => {
        for (const e of CASES) {
            expect(isShowThing(e), e.id).toBe(isRigEntity(e) || isArchitectureEntity(e))
        }
    })
})
