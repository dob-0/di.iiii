// The show's cleared hall (2026-10-07): what the owner said will be moved out before the night.
// Guards the layer's form: it only clears ids that the as-found layers define, and each entry says who decided it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rigs = join(dirname(fileURLToPath(import.meta.url)), 'rigs')
const read = (f) => JSON.parse(readFileSync(join(rigs, f), 'utf8'))
const layer = read('moxir-hall-show-cleared-2026-10-17.json')
const asFound = [
  ...read('moxir-hall-features-2026-09-28.json').massing,
  ...(read('moxir-hall-dims-2026-10-02.json').massing_add || []),
  ...(read('moxir-hall-dims-2026-10-07.json').massing_add || []),
]

describe('moxir hall: cleared for the show', () => {
  it('clears only ids the as-found layers define', () => {
    const ids = new Set(asFound.map((m) => m.id))
    for (const m of layer.massing_remove) expect(ids.has(m.id), m.id).toBe(true)
  })
  it('says who decided each clearing, why, and what to check on site', () => {
    for (const m of layer.massing_remove) {
      expect(m.said_by, m.id).toMatch(/owner/)
      expect(m.why, m.id).toBeTruthy()
      expect(m.check_on_site, m.id).toBeTruthy()
    }
  })
  it('clears the cabin and never the fixed machinery', () => {
    const ids = layer.massing_remove.map((m) => m.id)
    expect(ids).toContain('prefab-cabin')
    for (const fixed of ['press', 'blower', 'machine-line', 'drum-tank']) expect(ids).not.toContain(fixed)
  })
  it('keeps what is cleared but never modelled (the bulk bags) out of massing_remove, with the same record', () => {
    // hall.py refuses a massing_remove id the massing does not hold; the bags stay out of the massing on purpose
    const ids = new Set(asFound.map((m) => m.id))
    const notModelled = layer.cleared_not_modelled || []
    expect(notModelled.map((m) => m.id)).toContain('white-bags')
    for (const m of notModelled) {
      expect(ids.has(m.id), m.id).toBe(false)
      expect(m.said_by, m.id).toMatch(/owner/)
      expect(m.why, m.id).toBeTruthy()
      expect(m.check_on_site, m.id).toBeTruthy()
    }
  })
})
