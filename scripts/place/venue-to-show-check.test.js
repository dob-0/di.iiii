// venue_to_show_check.py (2026-10-15): reads a project document and says, per step of docs/ai/skills/venue-to-show.md, whether
// its artefact is there. The test holds: a complete document passes (exit 0, the lines-of-light row OWED, never failing); a
// document missing looks, a cue's look and a laser line's frames fails (exit 1) and names those steps; --off-dmx takes a
// non-DMX fixture type out of the patch count; an unreadable file exits 2 and says why.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import json'], { encoding: 'utf8' }).status === 0
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venue-to-show-'))

const lamp = (id, type, extra = {}) => ({ id, type: 'spotLight', components: { fixture: { type, universe: 1, address: 1 }, beam: { visible: true, length: 12 }, ...extra } })
const full = () => ({
    assets: [{ id: 'a-hall', name: 'hall.glb' }],
    entities: [
        { id: 'hall', type: 'model', components: { media: { assetId: 'a-hall' } } },
        { id: 'show', type: 'group', components: { venuePlan: {}, rentalList: {}, rigLooks: { source: 'rig.json', looks: [{ id: 'open' }, { id: 'drop' }] } } },
        lamp('w1', 'wash-a'),
        lamp('l1', 'net-laser', { fixture: { type: 'net-laser' }, beam: { visible: true, laser: { frames: [{ t: 0 }] } } })
    ],
    mappingState: { cues: [{ id: 'c1', lightLook: 'rig-open' }, { id: 'c2', lightLook: 'drop' }], loop: true, showEpoch: 1 },
    renderSettings: { atmosphere: { scattering: 0.02 }, exposure: { auto: false }, bloom: { enabled: true } },
    worldState: { fog: { far: 90 } },
    presentationState: { viewPresets: [{ id: 'floor' }], entryView: 'fixed-camera' }
})
const run = (doc, ...extra) => {
    const f = path.join(dir, `d-${Math.random().toString(36).slice(2)}.json`)
    fs.writeFileSync(f, typeof doc === 'string' ? doc : JSON.stringify({ document: doc }))
    return spawnSync('python3', ['-I', path.join(here, 'venue_to_show_check.py'), '--doc', f, ...extra], { encoding: 'utf8' })
}

describe.skipIf(!hasPython)('venue_to_show_check.py', () => {
    it('passes a document with every step, the lines-of-light row OWED but not failing', () => {
        const r = run(full(), '--off-dmx', 'NET-LASER')
        expect(r.status, r.stdout + r.stderr).toBe(0)
        expect(r.stdout).toMatch(/OWED\s+standard look \(lines of light\)/)
        expect(r.stdout).toContain('1/1 DMX units patched')
        expect(r.stdout).toContain('13/13 steps present')
    })
    it('names the missing steps: looks gone, a cue pointing at no look, a laser line without frames, a loose DMX unit', () => {
        const d = full()
        d.entities[1].components.rigLooks.looks = [{ id: 'open' }]
        d.entities[3].components.beam.laser.frames = []
        const r = run(d)
        expect(r.status).toBe(1)
        expect(r.stdout).toMatch(/MISSING\s+cues\s+2 cues, 2 with a look, 1 pointing at no look/)
        expect(r.stdout).toMatch(/MISSING\s+laser frames\s+0\/1/)
        expect(r.stdout).toMatch(/MISSING\s+rig \(patch\).*unpatched types: net-laser/)
        expect(r.stdout).toContain('missing: rig (patch), cues, laser frames')
    })
    it('exits 2 and says why when the document cannot be read', () => {
        const r = run('{not json')
        expect(r.status).toBe(2)
        expect(r.stdout).toContain('cannot read the document')
    })
})
