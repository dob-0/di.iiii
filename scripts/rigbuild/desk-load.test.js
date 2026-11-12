// desk-load.mjs (owner N3898): the plan says whether the desk must leave another space's show, and never claims a switch it does not need.
import { describe, it, expect } from 'vitest'
import { planLoad } from './desk-load.mjs'

const document = { entities: [{ id: 'a', components: { dmx: { address: 1 } } }, { id: 'b', components: {} }], mappingState: { cues: [{ id: 'c1' }, { id: 'c2' }] } }

describe('desk-load plan', () => {
    it('switches when the desk holds another space, and says the output is on', () => {
        expect(planLoad({ show: { space: 'moxir', live: true }, space: 'platina', document })).toEqual({ from: 'moxir', to: 'platina', switch: true, live: true, lamps: 1, cues: 2 })
    })
    it('does not switch when the desk already holds the space', () => {
        expect(planLoad({ show: { space: 'platina', live: false }, space: 'platina', document }).switch).toBe(false)
    })
})
