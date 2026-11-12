// Track scene "Рок-н-роллер" lamp cues: timing matches the marks file, limits kept (no strobe, <3 level changes/s, no full-field white).
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const spec = JSON.parse(readFileSync(join(here, 'rigs', 'platina-scenes-spec-track-rok-2026-11-12.json'), 'utf8'))
const marksFile = join(process.env.HOME || '', 'work/platina/scenes/track-rok-n-roller/timeline-30s.json')
describe('track-rok lamp cues', () => {
    const S = spec.scenes
    it('ids are track-rok-*, starts ascend, holds are the gaps and sum to 30 s', () => {
        expect(S.every((s) => /^track-rok-/.test(s.id))).toBe(true)
        S.forEach((s, i) => { if (i) expect(s.t0_s).toBeGreaterThan(S[i - 1].t0_s); if (i < S.length - 1) expect(s.hold_s).toBeCloseTo(S[i + 1].t0_s - s.t0_s, 3) })
        expect(S.reduce((a, s) => a + s.hold_s, 0)).toBeCloseTo(30, 3)
    })
    it('at most 2 level changes in any 1 s window, fades never longer than the hold', () => {
        const t = S.map((s) => s.t0_s)
        for (const a of t) expect(t.filter((x) => x >= a && x < a + 1).length).toBeLessThanOrEqual(2)
        S.forEach((s) => expect(s.fade_s).toBeLessThanOrEqual(s.hold_s))
    })
    it('no strobe and no lamp above 85 % (no full-field white)', () => {
        S.forEach((s) => { expect(s.motion.mode).toBe('none'); Object.values(s.parts).forEach(([, lv]) => expect(lv).toBeLessThanOrEqual(0.85)) })
    })
    it.skipIf(!existsSync(marksFile))('first start is 0 and the drop is at the marks file 12 s', () => {
        expect(S[0].t0_s).toBe(0)
        expect(S.find((s) => s.id === 'track-rok-drop').t0_s).toBe(12)
    })
})
