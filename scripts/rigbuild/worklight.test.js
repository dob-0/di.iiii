// worklight looks layer: ash / ember only, parts exist in the rig, every look keeps a readable floor (the work light is
// even and lit, no other look is pure black), cues play only known looks, 25+ looks, WORK first.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAYER_FILE, RIG_V11, withFloor } from './worklight-looks.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (f) => JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8'))
const layer0 = read(LAYER_FILE)
const layer = { ...layer0, looks: layer0.looks.map((l) => withFloor(layer0, l)) }
const parts = new Set([...read(RIG_V11).fixtures.map((f) => f.part), 'cube6a'])
const KIT = new Set(['up-pl5403', 'up-b380f', 'ext-lc-ultra-mk2', 'up-yz31p'])
const kitParts = new Set([...read(RIG_V11).fixtures.filter((f) => KIT.has(f.type)).map((f) => f.part), 'cube6a', 'laser'])
describe('MOXIR work-light looks layer', () => {
    it('keeps the floor as one key, not copied into looks', () => {
        expect(Object.keys(layer0.floor).length).toBeGreaterThan(1)
        expect(layer0.looks.find((l) => l.id === 'still_smoking').parts['span columns']).toBeUndefined()
    })
    it('has 25+ looks, work light first, ids unique', () => {
        expect(layer.looks.length).toBeGreaterThanOrEqual(25)
        expect(layer.cues[0].lightLook).toBe('rig-work-light')
        expect(new Set(layer.looks.map((l) => l.id)).size).toBe(layer.looks.length)
    })
    it('uses only rig parts and ash / ember colours', () => {
        for (const l of layer.looks) for (const [k, [c, v]] of Object.entries(l.parts)) {
            expect(parts.has(k) || k === 'laser', `${l.id}:${k}`).toBe(true)
            if (c) expect(layer.colours).toContain(c)
            expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1)
        }
    })
    it('no look is pure black: every look lights the columns or the machines', () => {
        for (const l of layer.looks) expect(['span columns', 'far columns', 'still smoking'].some((k) => l.parts[k]), l.id).toBe(true)
    })
    it('drives only the Sevan kit (PL5403, B380F, LaserCubes, 1 smoke): no 250BSW, HK1915, blinder or strobe part', () => {
        for (const l of layer.looks) for (const k of Object.keys(l.parts)) expect(kitParts.has(k), `${l.id}:${k}`).toBe(true)
    })
    it('work light lights the stage, the floor side and the walls; cues name known looks', () => {
        const w = layer.looks.find((l) => l.id === 'work_light').parts
        for (const k of ['curtain', 'halo', 'arch', 'far columns', 'span columns']) expect(w[k]).toBeTruthy()
        expect(w.laser).toBeUndefined(); expect(w.lightning).toBeUndefined()
        const ids = new Set(layer.looks.map((l) => `rig-${l.id.replace(/_/g, '-')}`))
        for (const c of layer.cues) expect(ids.has(c.lightLook)).toBe(true)
    })
})
