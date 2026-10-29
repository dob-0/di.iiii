// motion-looks.mjs merged(): the two looks layers as one. Guards the MOXIR one integration fix (2026-10-09): the work-light
// layer keeps its readable floor as one key (#858), so a work-light look with `floor: true` must come out with the floor parts.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { merged, LAYER_FILE as MOTION_FILE } from './motion-looks.mjs'
import { LAYER_FILE as WORKLIGHT_FILE } from './worklight-looks.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (f) => JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8'))

describe('motion-looks merged(): work light + the ten moving scenes', () => {
    const wl = read(WORKLIGHT_FILE)
    const mo = read(MOTION_FILE)
    const both = merged(wl, mo)
    it('gives every work-light look marked `floor` the layer\'s floor parts (its own part wins)', () => {
        const floored = wl.looks.filter((l) => l.floor)
        expect(floored.length).toBeGreaterThan(0)
        for (const l of floored) {
            const out = both.looks.find((x) => x.id === l.id)
            for (const part of Object.keys(wl.floor)) expect(out.parts[part], `${l.id}: ${part}`).toEqual(l.parts[part] ?? wl.floor[part])
        }
    })
    it('leaves a work-light look without `floor` as it is, and the ten moving looks as written', () => {
        for (const l of wl.looks.filter((x) => !x.floor)) expect(both.looks.find((x) => x.id === l.id).parts).toEqual(l.parts)
        for (const l of mo.looks) expect(both.looks.find((x) => x.id === l.id)).toBe(l)
    })
    it('puts the work-light looks first and the ten scenes\' cues first', () => {
        expect(both.looks.map((l) => l.id)).toEqual([...wl.looks, ...mo.looks].map((l) => l.id))
        expect(both.cues.slice(0, mo.cues.length)).toEqual(mo.cues)
    })
})
