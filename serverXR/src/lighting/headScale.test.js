import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const { headsFrame, headsPose } = req('./headMotion.js')
const { sanitizeLayer } = req('./looks.js')

// Movement size (owner N7315): a layer's headScale scales the swing around the look's own centre.
const unit = { id: 'a', x: 0, z: 0, hung: false, panRange: 540, tiltRange: 270 }
const mk = (extra) => ({
  looks: [{ id: 'L', kind: 'all', heads: { pattern: 'circle', spatial: 'all', pan_deg: 60, tilt_deg: 40, period_s: 8, units: [unit] } }],
  layers: [{ id: 'l1', on: true, lookId: 'L', level: 1, priority: 0, firedAt: 0, ...extra }],
})
const ch = ['pan', 'pan_fine', 'tilt', 'tilt_fine']
const rest = { pan: 128, pan_fine: 0, tilt: 128, tilt_fine: 0 }
const pose = (state, now) => { const f = headsFrame(state, now); return headsPose(f.get('a'), ch, (r) => rest[r]) }
const T = [0, 700, 1500, 2300, 4100, 6000, 7777]

describe('layer head scale', () => {
  it('at 100 % (absent, 1, or out of range high) the output is byte-identical to today', () => {
    for (const now of T) {
      const base = pose(mk({}), now)
      expect(pose(mk({ headScale: 1 }), now)).toEqual(base)
      expect(pose(mk({ headScale: 7 }), now)).toEqual(base)
    }
  })
  it('at 0 % the heads hold the centre (the rest bytes)', () => {
    for (const now of T) expect(pose(mk({ headScale: 0 }), now)).toEqual({ pan: 128, pan_fine: 0, tilt: 128, tilt_fine: 0 })
  })
  it('in between it halves the swing and never leaves 0-255', () => {
    const swing = (s, now) => { const p = pose(mk({ headScale: s }), now); return p.pan * 256 + p.pan_fine - 128 * 256 }
    for (const now of T) {
      const full = swing(1, now), half = swing(0.5, now)
      expect(Math.abs(half - full / 2)).toBeLessThanOrEqual(2)
    }
    for (const s of [-3, 0, 0.3, 1, 5, NaN]) for (const now of T) {
      const p = pose(mk({ headScale: s }), now)
      for (const v of Object.values(p)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255) }
    }
  })
  it('a saved layer is unchanged at 100 % and keeps a lower value', () => {
    expect('headScale' in sanitizeLayer({ id: 'x' })).toBe(false)
    expect('headScale' in sanitizeLayer({ id: 'x', headScale: 1 })).toBe(false)
    expect(sanitizeLayer({ id: 'x', headScale: 0.4 }).headScale).toBe(0.4)
    expect(sanitizeLayer({ id: 'x', headScale: -2 }).headScale).toBe(0)
  })
})
