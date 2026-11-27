import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const { onAirOf } = createRequire(import.meta.url)('./looks.js')

const looks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const L = (id, lookId, extra = {}) => ({ id, on: true, level: 1, priority: 0, lookId, ...extra })

describe('onAirOf: the look on air from every source', () => {
  it('nothing on air: null', () => {
    expect(onAirOf({ layers: [], looks })).toBeNull()
    expect(onAirOf({ layers: [L('cue', 'a', { on: false })], looks })).toBeNull()
    expect(onAirOf({ layers: [L('cue', 'a', { level: 0 })], looks })).toBeNull()
    expect(onAirOf({ layers: [L('cue', '')], looks })).toBeNull()
    expect(onAirOf(null)).toBeNull()
  })
  it('the cue layer (play in order, a cue GO, a tap)', () => {
    expect(onAirOf({ layers: [L('cue', 'b')], looks })).toEqual({ lookId: 'b', layerId: 'cue' })
  })
  it('the top layer of the mix wins: higher priority, a tie goes to the later layer', () => {
    expect(onAirOf({ layers: [L('cue', 'a', { priority: 2 }), L('x', 'b', { priority: 1 })], looks })).toEqual({ lookId: 'a', layerId: 'cue' })
    expect(onAirOf({ layers: [L('cue', 'a'), L('x', 'b')], looks })).toEqual({ lookId: 'b', layerId: 'x' })
  })
  it('a layer that is off, at 0, or holds a look that does not exist is not on air; the next one down is', () => {
    expect(onAirOf({ layers: [L('cue', 'a'), L('x', 'b', { on: false })], looks }).lookId).toBe('a')
    expect(onAirOf({ layers: [L('cue', 'a'), L('x', 'b', { level: 0 })], looks }).lookId).toBe('a')
    expect(onAirOf({ layers: [L('cue', 'a'), L('x', 'gone')], looks }).lookId).toBe('a')
  })
})
