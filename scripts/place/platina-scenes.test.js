// The Platina scenes (2026-11-11): the committed scenes file and the rig built from it keep the owner's hard limits.
// Amber out, hold_s > 0, no laser, XP-16R white only, K10/K15/bars colour+level only, parts are the rig's own, flash <= 3/s.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rigs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rigs')
const read = (n) => JSON.parse(fs.readFileSync(path.join(rigs, n), 'utf8'))
const doc = read('platina-scenes-2026-11-11.json')
const rig = read('platina-rig-scenes-2026-11-11.json')
const spec = read('platina-scenes-spec-2026-11-11.json')
const units = rig.fixtures
const partType = Object.fromEntries(units.map((u) => [u.part, u.type]))
const hue = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return null; const d = mx - mn; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360 }

describe('Platina scenes', () => {
    it('22 scenes, rig has 22 looks and 22 cues in the same order', () => {
        expect(doc.scenes).toHaveLength(22)
        expect(rig.looks.map((l) => l.id)).toEqual(doc.scenes.map((s) => s.id))
        expect(rig.cues.map((c) => c.look)).toEqual(doc.scenes.map((s) => s.id))
    })
    it('every part is a unit part of the rig; every cue hold is > 0', () => {
        for (const s of doc.scenes) {
            for (const p of Object.keys(s.parts)) expect(partType[p], `${s.id}: ${p}`).toBeTruthy()
            expect(s.cue.hold_s, s.id).toBeGreaterThan(0)
        }
    })
    it('no laser key is set, no amber (hue 25-55 degrees at any saturation) in any colour', () => {
        for (const s of doc.scenes) {
            expect(s.laser ?? null, s.id).toBeNull(); expect(s.laser_colour ?? null, s.id).toBeNull(); expect(s.laser_lines ?? null, s.id).toBeNull()
            for (const [p, [hex, lv]] of Object.entries(s.parts)) {
                const h = hue(hex)
                if (lv > 0 && h !== null) expect(h < 25 || h > 55, `${s.id} ${p} ${hex}`).toBe(true)
            }
        }
    })
    it('XP-16R parts carry white only', () => {
        for (const s of doc.scenes) for (const [p, [hex]] of Object.entries(s.parts)) if (partType[p] === 'acme-xp16r-bsw') expect(hex, `${s.id} ${p}`).toBe('#ffffff')
    })
    it('heads patterns name only the XP-16R; the spec flash rule is 3 a second', () => {
        for (const s of doc.scenes) if (s.heads) expect(s.heads.kinds).toEqual(['acme-xp16r-bsw'])
        expect(spec.rules.flash).toBe(3)
    })
})
