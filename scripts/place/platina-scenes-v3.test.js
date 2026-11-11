// The Platina v3 scenes (2026-11-12, owner N3745 / N3759): the committed v3 scenes file and the rig built from it keep the
// same hard limits as the 22-scene set, cover every kept screen look, and end with the machine's stress block.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (n) => JSON.parse(fs.readFileSync(path.join(here, 'rigs', n), 'utf8'))
const doc = read('platina-scenes-v3-2026-11-12.json')
const rig = read('platina-rig-scenes-v3-2026-11-12.json')
const partType = Object.fromEntries(rig.fixtures.map((u) => [u.part, u.type]))
const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx === mn) return null
    const d = mx - mn
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    return (h * 60 + 360) % 360
}

describe('Platina v3 scenes', () => {
    it('the rig built from them has the same looks and cues, in the same order', () => {
        expect(rig.looks.map((l) => l.id)).toEqual(doc.scenes.map((s) => s.id))
        expect(rig.cues.map((c) => c.look)).toEqual(doc.scenes.map((s) => s.id))
    })

    it('every part is a unit part of the rig; every cue hold is > 0', () => {
        for (const s of doc.scenes) {
            for (const p of Object.keys(s.parts)) expect(partType[p], `${s.id}: ${p}`).toBeTruthy()
            expect(s.cue.hold_s, s.id).toBeGreaterThan(0)
        }
    })

    it('no laser, no amber (hue 25-55 degrees), XP-16R white only, head patterns on the XP-16R only', () => {
        for (const s of doc.scenes) {
            expect(s.laser ?? null, s.id).toBeNull()
            for (const [p, [hex]] of Object.entries(s.parts)) {
                const h = hue(hex)
                expect(h != null && h >= 25 && h <= 55, `${s.id}: ${p} ${hex}`).toBe(false)
                if (partType[p] === 'acme-xp16r-bsw') expect(hex, `${s.id}: ${p}`).toBe('#ffffff')
            }
            if (s.heads) expect(s.heads.kinds, s.id).toEqual(['acme-xp16r-bsw'])
        }
    })

    it('every kept screen look has a light scene, and one with the beam lamps', () => {
        for (const look of doc.screen_looks.kept) {
            const mine = doc.scenes.filter((s) => s.screen_look === look)
            expect(mine.length, look).toBeGreaterThanOrEqual(2)
            expect(mine.some((s) => s.heads), `${look}: a beam variant`).toBe(true)
        }
        expect(doc.scenes.some((s) => doc.screen_looks.waiting_for_a_fix_no_scene_yet.includes(s.screen_look))).toBe(false)
    })

    it('the stress block is the end of the cue list and its first two scenes light every lamp of the rig', () => {
        const ids = doc.scenes.map((s) => s.id)
        const first = ids.findIndex((i) => i.startsWith('stress-'))
        expect(first).toBeGreaterThan(0)
        expect(ids.slice(first).every((i) => i.startsWith('stress-'))).toBe(true)
        for (const id of ['stress-all-white', 'stress-all-colour']) {
            const s = doc.scenes.find((x) => x.id === id)
            const lit = Object.entries(s.parts).filter(([, v]) => v[1] === 1).map(([p]) => p)
            const lamps = rig.fixtures.filter((u) => u.angle_rad > 0 || u.type === 'acme-pixel-line-ip').map((u) => u.part)
            expect(lamps.filter((p) => !lit.includes(p)), id).toEqual([])
        }
    })

    it('no scene is over 3 flashes a second (the desk engine own count)', () => {
        const r = spawnSync('node', [path.join(here, 'scenes_flash.cjs'), path.join(here, 'rigs', 'platina-scenes-v3-2026-11-12.json')], { encoding: 'utf8' })
        expect(r.stdout.split('\n').filter((l) => l.startsWith('OVER'))).toEqual([])
        expect(r.status).toBe(0)
    })
})

describe('Platina 30 s piece', () => {
    const piece = read('platina-rig-piece-rok-n-roller-2026-11-12.json')
    it('its cues start at the times measured on the track and reach the blackout at 30.0 s', () => {
        const starts = []
        let t = 0
        for (const c of piece.cues) { starts.push([Math.round(t * 100) / 100, c.look]); t += c.hold }   // showClock.js: a cue lasts its hold
        expect(starts).toEqual([[0, 'white-back'], [9, 'freeze-hold'], [12.24, 'drop-hit'], [13, 'drop-red'], [24.38, 'white-back-beams'], [27.4, 'drop-magenta'], [30, 'blackout']])
        expect(piece.cues.every((c) => c.fade <= c.hold)).toBe(true)
    })
})
