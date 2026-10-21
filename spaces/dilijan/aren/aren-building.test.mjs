// Aren's wall as one building (N1145, 2026-10-21): the owner saw the pieces of Պատը "at different angles" and said "look
// walls parallel, windows parallel it the one building". elevation.py measures each facade (plane, photographed side, level)
// and lays them out as one elevation; elevation_test.py holds the method's cases with known answers. This runs them in the
// node suite and guards the page: every facade faces the viewer and is parallel to the others, the courtyard stays, the
// cabin is drawn at the yard's scale, and the baked shadow travels with its piece.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const page = fs.readFileSync(path.join(here, 'yard.html'), 'utf8')
const hasPython = spawnSync('python3', ['-c', 'import numpy, PIL'], { encoding: 'utf8' }).status === 0

describe.skipIf(!hasPython)('elevation.py (planes, level, layout, registration)', () => {
  it('python cases pass', () => {
    const r = spawnSync('python3', ['-I', '-m', 'unittest', 'discover', '-s', here, '-p', 'elevation_test.py'], { encoding: 'utf8', timeout: 600000 })
    expect(r.stderr).toMatch(/\nOK\s*$/)
    expect(Number(/Ran (\d+) tests?/.exec(r.stderr)[1])).toBeGreaterThan(0)
  }, 600000)
})

// rotate v by the unit quaternion q = [x, y, z, w]
const rotate = ([x, y, z, w], [vx, vy, vz]) => {
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx)
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)]
}
const deg = (a, b) => (Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b))) * 180) / Math.PI

describe('yard.html stands Պատը as one building', () => {
  const inWall = JSON.parse(/const IN_WALL=(\{.*?\});/.exec(page)[1])
  const view = JSON.parse(/const WALL_VIEW=(\{.*?\});/.exec(page)[1])
  const inYard = JSON.parse(/const IN_YARD=(\{.*?\});/.exec(page)[1])
  const toViewer = [Math.sin(view.theta), 0, Math.cos(view.theta)]

  // N1145.3 (2026-10-22): the 'facade normal' and 'walls parallel' cases guarded the one-line elevation the owner rejected;
  // the building's own guard is building.test.mjs (each piece where the yard scan holds it, on the map).
  it('the courtyard stays where the yard scan puts it; the cabin is drawn at the yard scale', () => {
    expect(inWall.courtyard.q).toEqual(inYard.courtyard.q)
    inWall.courtyard.t.forEach((v, k) => expect(v).toBeCloseTo(inYard.courtyard.t[k], 3))
    expect(inWall.cabin.s).toBeGreaterThan(0.8)
    expect(inWall.cabin.s).toBeLessThan(0.9) // scanned apart at 1.19x: 0.84 measured on wall_mid (elevation.py)
    expect(inWall.wall.s).toBe(1)
  })
  it('the page reads the elevation: pose, scale, frame, a camera facing the facades', () => {
    expect(page).toMatch(/const w=only==='yard'\?null:IN_WALL\[m\.name\];/)
    expect(page).toContain('if(w&&w.s) group.scale.setScalar(w.s);')
    expect(page).toContain('const wc=new THREE.Vector3().fromArray(WALL_VIEW.centre);')
    expect(page).toContain('if(i===1) return wallPose({theta:WALL_VIEW.theta,phi:WALL_PHI,dist:fitD});')
    expect(page).not.toMatch(/theta:-0\.42/)
  })
  it('the shadow is carried by its piece (no shadow where nothing stands)', () => {
    const fn = page.slice(page.indexOf('function buildShadow('), page.indexOf('\n}\n', page.indexOf('function buildShadow(')))
    expect(fn).toContain('p.g.add(plane);')
    expect(fn).not.toContain('scene.add(')
  })
})
