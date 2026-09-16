// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { LOCAL_FEATURES, agree } = require('./features.js')

describe('rig features', () => {
  it('step 1 declares exactly the five core features at version 1', () => {
    expect(LOCAL_FEATURES).toEqual({ card: 1, cue: 1, blackout: 1, members: 1, discovery: 1 })
    expect(Object.isFrozen(LOCAL_FEATURES)).toBe(true)
  })

  it('agrees on the minimum of names present on both sides', () => {
    expect(agree({ card: 3, cue: 1, pictures: 2 }, { card: 1, cue: 4, hold: 1 })).toEqual({ card: 1, cue: 1 })
  })

  it('is symmetric', () => {
    const a = { card: 2, cue: 5, vj: 1 }
    const b = { card: 7, cue: 1, lanes: 3 }
    expect(agree(a, b)).toEqual(agree(b, a))
  })

  it('ignores unknown names (§4 rule 2) and anything that is not a positive integer', () => {
    expect(agree(LOCAL_FEATURES, {
      card: '2', cue: 1.5, blackout: 0, members: -1, discovery: null, futureThing: 9
    })).toEqual({})
    expect(agree({ card: 1 }, { card: true })).toEqual({})
    expect(agree({ card: 1 }, { card: { v: 1 } })).toEqual({})
  })

  it('never throws on tables that are not tables', () => {
    for (const bad of [null, undefined, 1, 'x', [1, 2]]) {
      expect(agree(bad, LOCAL_FEATURES)).toEqual({})
      expect(agree(LOCAL_FEATURES, bad)).toEqual({})
    }
  })

  it('does not follow a peer-supplied __proto__ key', () => {
    const hostile = JSON.parse('{"__proto__": 5, "card": 1}')
    const agreed = agree({ card: 1 }, hostile)
    expect(agreed).toEqual({ card: 1 })
    expect(Object.getPrototypeOf(agreed)).toBe(Object.prototype)
  })
})
