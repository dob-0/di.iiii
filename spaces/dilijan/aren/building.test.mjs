// Aren's pieces as ONE building on the map (N1145.3, 2026-10-22): the owner rejected the one-line elevation ("I want it full
// like a building"). building.py puts each piece where the yard scan holds it and registers that frame on the OSM footprint.
// This guards what the page and the record carry: no piece is flattened onto a line, the footprint is the map's, the
// registration's numbers are the ones measured.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const html = fs.readFileSync(path.join(here, 'yard.html'), 'utf8')
const grab = (name) => JSON.parse(html.match(new RegExp(`const ${name}=(.*?);\\n`))[1])
const rec = JSON.parse(fs.readFileSync(path.join(here, '..', 'building-pieces.json'), 'utf8'))
const fp = JSON.parse(fs.readFileSync(path.join(here, '..', 'building-footprint.json'), 'utf8'))

describe('Aren: the building as it stands', () => {
  it('each piece stands where the yard scan holds it (no layout of its own)', () => {
    const inWall = grab('IN_WALL'), inYard = grab('IN_YARD')
    for (const k of ['wall', 'courtyard']) {
      inYard[k].t.forEach((v, i) => expect(inWall[k].t[i]).toBeCloseTo(v, 3))
      inYard[k].q.forEach((v, i) => expect(Math.abs(inWall[k].q[i])).toBeCloseTo(Math.abs(v), 4))
    }
    expect(inWall.cabin.s).toBeGreaterThan(0.8); expect(inWall.cabin.s).toBeLessThan(0.9)   // scanned apart at 1.19x
    expect(rec.IN_WALL).toEqual(inWall)
  })
  it('the pieces are not on one line: the wall turns away from the long face', () => {
    // wall bearing ~355 deg against the long face's ~42-54 deg: a corner, not an elevation
    const b = rec.checks.yard_wall_bearing_deg, along = Math.min(Math.abs(((b - 48 + 540) % 360) - 180), Math.abs(((b - 228 + 540) % 360) - 180))
    expect(along).toBeGreaterThan(30)
  })
  it('the footprint is the OSM way, closed, with its source and licence', () => {
    expect(fp.source.licence).toMatch(/ODbL/); expect(fp.local_m[0]).toEqual(fp.local_m[fp.local_m.length - 1])
    const foot = grab('FOOT'); expect(foot.length).toBe(fp.local_m.length)
  })
  it('the facades lie on their map edges (medians under 0.3 m)', () => {
    for (const k of ['main', 'wall_mid']) expect(rec.checks.facade_to_edge[k].off_median_m).toBeLessThan(0.3)
    expect(rec.map_from_scan.scale_m_per_unit).toBeGreaterThan(3); expect(rec.map_from_scan.scale_m_per_unit).toBeLessThan(4.5)
  })
  it('the view looks at the building from above its eaves', () => {
    const v = grab('WALL_VIEW'); expect(v.phi).toBeGreaterThan(0.3); expect(typeof v.foot).toBe('number')
  })
})
