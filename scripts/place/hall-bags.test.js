// The 2026-10-07 bags check: fixed metal behind the white bulk bags (blower, ducts, hopper).
// Guards the layer's form: every moved/added item names its photos, confidence and how; one-direction
// items stay SUSPECTED; moves name ids that exist; the bags themselves stay out of the massing.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rigs = join(dirname(fileURLToPath(import.meta.url)), 'rigs')
const read = (f) => JSON.parse(readFileSync(join(rigs, f), 'utf8'))
const layer = read('moxir-hall-dims-2026-10-07.json')
const earlier = [
  ...read('moxir-hall-features-2026-09-28.json').massing,
  ...(read('moxir-hall-dims-2026-10-02.json').massing_add || []),
]

describe('moxir hall: bags check layer (2026-10-07)', () => {
  it('moves only ids that earlier layers define', () => {
    const ids = new Set(earlier.map((m) => m.id))
    for (const m of layer.massing_move) expect(ids.has(m.id)).toBe(true)
  })
  it('gives every moved or added item its photos, confidence and how', () => {
    for (const m of [...layer.massing_move, ...layer.massing_add]) {
      expect(m.photos, m.id).toBeTruthy()
      expect(m.confidence, m.id).toBeTruthy()
      expect(m.how, m.id).toBeTruthy()
      for (const k of ['x_m', 'z_m', 'y_m']) expect(m[k][1]).toBeGreaterThan(m[k][0])
    }
  })
  it('keeps items seen from one direction SUSPECTED', () => {
    for (const m of layer.massing_add) {
      if (!/,/.test(m.photos)) expect(m.confidence, m.id).toMatch(/SUSPECTED/)
    }
  })
  it('places the blower behind the bags (z 17.5-21.5), not at z 20-25', () => {
    const b = layer.massing_move.find((m) => m.id === 'blower')
    expect(b.z_m).toEqual([17.5, 21.5])
    expect(b.y_m[1]).toBeLessThan(2.5)
  })
  it('keeps the bags out of the massing and lists them as movable', () => {
    const all = [...earlier, ...layer.massing_add]
    expect(all.some((m) => /bag/i.test(m.id))).toBe(false)
    expect(layer.movable_note.items.some((s) => /bulk bags/.test(s))).toBe(true)
  })
  it('has the roller conveyor the owner marked beside bag 7, low and inside the stage area, its doubt stated', () => {
    const c = layer.massing_add.find((m) => m.id === 'roller-conveyor')
    expect(c.photos).toMatch(/owner/)
    expect(c.y_m[1]).toBeLessThan(1.2)
    expect(c.z_m[1]).toBeLessThanOrEqual(24.5)
    expect(c.confidence).toMatch(/did not close/)
  })
})
