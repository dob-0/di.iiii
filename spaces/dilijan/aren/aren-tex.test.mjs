// Aren's one view, its photos (N1131, 2026-10-21): the owner saw the yard "not the right textured". Measured causes: the
// wall stood 4.3 degrees off its scanned lean (a yaw-only pose), and the yard's photos were drawn in the wall page's light
// (darker, greyer: luma 0.62-0.77x, saturation 0.50-0.64x of the yard page). texfit_test.py holds the method's cases (seams
// tell flipY apart, the UV fit finds a tilted pose a yaw-only fit cannot, quaternions, the page's poses); this runs them in
// the node suite and guards the page's own wiring.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const page = fs.readFileSync(path.join(here, 'yard.html'), 'utf8')
const hasPython = spawnSync('python3', ['-c', 'import numpy, PIL'], { encoding: 'utf8' }).status === 0

describe.skipIf(!hasPython)('texfit.py (the photo checks and the UV pose)', () => {
  it('python cases pass', () => {
    const r = spawnSync('python3', ['-I', '-m', 'unittest', 'discover', '-s', here, '-p', 'texfit_test.py'], { encoding: 'utf8' })
    expect(r.stderr).toMatch(/\nOK\s*$/)
    expect(Number(/Ran (\d+) tests?/.exec(r.stderr)[1])).toBeGreaterThan(0)
  })
})

describe('yard.html keeps the yard as photographed', () => {
  const inYard = JSON.parse(/const IN_YARD=(\{.*?\});/.exec(page)[1])
  it('every pose is a unit quaternion and a position; the cabin has none (not in the yard scan)', () => {
    for (const [name, p] of Object.entries(inYard)) {
      expect(p.q, name).toHaveLength(4)
      expect(Math.hypot(...p.q)).toBeCloseTo(1, 4)
      expect(p.t).toHaveLength(3)
    }
    expect(inYard.cabin).toBeUndefined()
  })
  it('the wall keeps its lean: its rotation is not a turn about the vertical alone', () => {
    const [x, , z] = inYard.wall.q
    expect(Math.hypot(x, z)).toBeGreaterThan(0.03) // a yaw-only pose has x = z = 0 (4.3 degrees of lean is about 0.037)
  })
  it("the yard's own parts stand in Բակը and the courtyard fragment only in Պատը", () => {
    expect(page).toMatch(/name:'main',[^}]*standsFor:'courtyard'/)
    expect(page).toMatch(/name:'wall_mid',/)
    expect(page).toMatch(/shownByYard\.has\(m\.name\)\?buildFragment\(m,imgs\[i\],'wall',\{stay:true,swap:true\}\)/)
  })
  it('colour in the yard is the photo itself; the light of the wall page only in Պատը', () => {
    expect(page).toContain('c=mix(mix(vec3(lum(t)),t,desat)*sh,t,photo);')
    expect(page).toContain('shared.photo.value=ease(shared.photo.value,where===0&&!trans?1:0,dt,0.5);')
    expect(page).toMatch(/function makeTexture\(img,flipY=true\)/)
  })
})
