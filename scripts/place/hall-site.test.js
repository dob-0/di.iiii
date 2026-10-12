// The 2026-10-08 site layer: the owner's visit photos applied to the as-found hall (v9) and the show hall (v9-show).
// Guards the layer's form (every item names its photos, confidence and how; one-view items stay SUSPECTED or LOW;
// moves and removals name ids earlier layers define; movable things stay out of the massing) and what the built
// records say (the near crane as found at the NW end on its own underside, the far crane kept, the cabin gone,
// the +x gallery falling toward the NW, the lamp layer at or above 9 m, the show crane position NOT decided here).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rigs = join(dirname(fileURLToPath(import.meta.url)), 'rigs')
const read = (f) => JSON.parse(readFileSync(join(rigs, f), 'utf8'))
const layer = read('moxir-hall-site-2026-10-08.json')
const v9 = read('moxir-hall-2026-10-08-v9.hall.json')
const v9show = read('moxir-hall-2026-10-08-v9-show.hall.json')
const earlier = [
  ...read('moxir-hall-features-2026-09-28.json').massing,
  ...(read('moxir-hall-dims-2026-10-02.json').massing_add || []),
  ...(read('moxir-hall-dims-2026-10-07.json').massing_add || []),
]
const ids = (rec) => rec.geometry.massing.map((m) => m.id)

describe('moxir hall: site layer 2026-10-08 (the form)', () => {
  it('says it is from photos, not taped, and is tagged an estimate for hall.py', () => {
    expect(layer.source).toBe('FROM PHOTOS 2026-10-08')
    expect(layer.basis).toMatch(/Nothing here is taped/)
    expect(v9.dimsOrigin.cranes_from_door_m).toMatch(/^estimate \(moxir-hall-site-2026-10-08\.json/)
  })
  it('moves and removes only ids that earlier layers define', () => {
    const known = new Set(earlier.map((m) => m.id))
    for (const m of [...layer.massing_move, ...layer.massing_remove]) expect(known.has(m.id), m.id).toBe(true)
  })
  it('gives every added or moved item its photos, confidence, how and a basis, with ordered ranges', () => {
    for (const m of [...layer.massing_move, ...layer.massing_add]) {
      for (const k of ['photos', 'confidence', 'how', 'basis']) expect(m[k], `${m.id}.${k}`).toBeTruthy()
      expect(m.basis, m.id).toMatch(/FROM PHOTOS 2026-10-08/)
      for (const k of ['x_m', 'z_m', 'y_m']) expect(m[k][1], `${m.id}.${k}`).toBeGreaterThan(m[k][0])
    }
  })
  it('keeps one-view items SUSPECTED or LOW', () => {
    for (const m of [...layer.massing_move, ...layer.massing_add]) expect(m.confidence, m.id).toMatch(/SUSPECTED|LOW/)
  })
  it('keeps the movable things (bags, skip, gas cylinders, vessels, forklift, floor pipes) out of the massing, with the fire risk named', () => {
    const movable = layer.movable.items.map((m) => m.id)
    for (const id of ['white-bags', 'skip', 'gas-cylinders', 'pressure-vessels', 'forklift', 'long-floor-pipes']) expect(movable, id).toContain(id)
    for (const id of movable) expect(ids(v9), id).not.toContain(id)
    expect(layer.movable.items.find((m) => m.id === 'gas-cylinders').risk).toMatch(/FIRE/)
    const bags = layer.as_found.white_bags
    expect(bags.z_m).toEqual([19, 23])
    expect(bags.x_m).toEqual([-0.6, 2.4])
  })
  it('lists the fixed things it could not place, and does not draw them', () => {
    const fixed = layer.fixed_not_placed.items.map((m) => m.id)
    for (const id of ['horizontal-tank', 'far-half-stair', 'side-gate-mesh-door']) {
      expect(fixed).toContain(id)
      expect(ids(v9)).not.toContain(id)
    }
  })
  it('does not decide the show position of the cranes', () => {
    expect(layer.order).toMatch(/NOT in this file/)
    expect(layer.as_found.near_crane.show_position).toMatch(/stage step/)
  })
})

describe('moxir hall: v9 (as found 2026-10-08) and v9-show', () => {
  it('has the near crane at the NW end, z 42.5, on its own 7.6 m underside, the cab at +x', () => {
    const [near, far] = v9.geometry.cranes
    expect(near.z_m).toBeCloseTo(42.5, 3)
    expect(near.girder_bottom_m).toBeCloseTo(7.6, 3)
    expect(near.girder_bottom_basis).toMatch(/170604/)
    expect(near.cab.x_m[0]).toBeGreaterThan(0)
    expect(near.cab.y_m[0]).toBeGreaterThanOrEqual(4.6)
    expect(near.cab.y_m[0]).toBeLessThanOrEqual(6.7)
    // the far crane keeps the 09-29 photo-007 place and underside; today's low-confidence read is recorded beside it
    expect(far.z_m).toBeCloseTo(-22.2, 3)
    expect(far.girder_bottom_m).toBeCloseTo(7.95, 3)
    expect(layer.as_found.far_crane.seen_10_08_z_range_m).toEqual([-36, -24])
  })
  it('has the cabin gone as found, and the show layer notes it as already gone', () => {
    expect(ids(v9)).not.toContain('prefab-cabin')
    expect(v9show.dimsOrigin.massing).toMatch(/prefab-cabin already gone: moxir-hall-site-2026-10-08\.json/)
  })
  it('replaces pipe racks 2-3 by the inclined gallery, falling toward the NW, under the prefix the rack checks look for', () => {
    expect(ids(v9)).not.toContain('pipe-rack-2')
    expect(ids(v9)).not.toContain('pipe-rack-3')
    const g = v9.geometry.massing.filter((m) => m.id.startsWith('pipe-rack-gallery-')).sort((a, b) => a.z_m[0] - b.z_m[0])
    expect(g).toHaveLength(4)
    for (let i = 1; i < g.length; i++) {
      expect(g[i].y_m[0]).toBeLessThan(g[i - 1].y_m[0])
      expect(g[i].y_m[1]).toBeLessThan(g[i - 1].y_m[1])
    }
    expect(g[0].y_m[1]).toBeGreaterThanOrEqual(7.0)   // "≈ 5-7 m" at the SE end
    const pipe = v9.geometry.massing.find((m) => m.id === 'pipe-rack-1')
    expect(pipe.y_m[1]).toBeLessThanOrEqual(3.6)
  })
  it('hangs the pendant lamps at or above 9 m over z -5..25 only', () => {
    const lamps = v9.geometry.massing.filter((m) => m.id.startsWith('pendant-lamp-'))
    expect(lamps.length).toBe(25)
    for (const m of lamps) {
      expect(m.y_m[0]).toBeGreaterThanOrEqual(9.0)
      expect(m.y_m[1]).toBeLessThan(v9.geometry.truss_bottom_m)
      expect(m.z_m[0]).toBeGreaterThanOrEqual(-5)
      expect(m.z_m[1]).toBeLessThanOrEqual(25)
    }
  })
  it('builds v9-show from the same chain plus the show-cleared layer, last', () => {
    expect(v9.dimsFiles.at(-1)).toMatch(/moxir-hall-site-2026-10-08\.json$/)
    expect(v9show.dimsFiles.slice(0, -1)).toEqual(v9.dimsFiles)
    expect(v9show.dimsFiles.at(-1)).toMatch(/moxir-hall-show-cleared-2026-10-17\.json$/)
    expect(v9show.dims.cranes_from_door_m).toEqual(v9.dims.cranes_from_door_m)
  })
})
