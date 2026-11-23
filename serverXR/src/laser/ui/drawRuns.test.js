// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { SEED_LOOKS, normaliseLook } = require('../laserDesk')
const { lookPointsAt } = require('../../../../shared/laserLook.cjs')
const { strokeLitRuns } = require('./drawRuns.js')

// The page's code before 2026-10-30, kept here only to compare against: one path and one stroke() per lit segment.
const strokeEachSegment = (g, points, X, Y) => {
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]
        const b = points[i]
        if (!(b[2] > 0 || b[3] > 0 || b[4] > 0)) continue
        g.strokeStyle = `rgb(${Math.round(b[2] * 255)},${Math.round(b[3] * 255)},${Math.round(b[4] * 255)})`
        g.beginPath()
        g.moveTo(X(a[0]), Y(a[1]))
        g.lineTo(X(b[0]), Y(b[1]))
        g.stroke()
    }
}

// A fake 2D context: records the segments each stroke() would draw (endpoints and colour) and counts stroke() calls.
const fakeContext = () => {
    const g = { segments: [], strokes: 0, strokeStyle: '', at: null, path: [] }
    g.beginPath = () => { g.path = []; g.at = null }
    g.moveTo = (x, y) => { g.at = [x, y] }
    g.lineTo = (x, y) => { g.path.push([...g.at, x, y]); g.at = [x, y] }
    g.stroke = () => { g.strokes += 1; for (const s of g.path) g.segments.push([...s, g.strokeStyle]) }
    return g
}

const X = (x) => 150 + x * 140
const Y = (y) => 100 - y * 90
const clock = { bpm: 120, zero: 0 }
const bank = SEED_LOOKS.map((l) => normaliseLook(l))
const TIMES = [0, 417, 1333, 2500, 7919]

describe('look tiles draw one stroke per colour run', () => {
    it('draws the same segments as one stroke per segment, in fewer stroke() calls', () => {
        expect(bank.length).toBeGreaterThanOrEqual(14)
        let before = 0
        let after = 0
        const rows = []
        for (const t of TIMES) {
            let b = 0
            let a = 0
            for (const look of bank) {
                const points = lookPointsAt({ ...look, points: Math.min(look.points, 240) }, { t, clock })
                const old = fakeContext()
                const now = fakeContext()
                strokeEachSegment(old, points, X, Y)
                strokeLitRuns(now, points, X, Y)
                expect(now.segments, `${look.id} at ${t}`).toEqual(old.segments)
                expect(now.strokes).toBeLessThanOrEqual(old.strokes)
                b += old.strokes
                a += now.strokes
            }
            rows.push(`t=${t}: ${b} -> ${a}`)
            before += b
            after += a
        }
        const report = `${rows.join('\n')}\nmean ${(before / TIMES.length).toFixed(0)} -> ${(after / TIMES.length).toFixed(0)}`
        process.stdout.write(`stroke() calls per frame for ${bank.length} looks, before -> after:\n${report}\n`)
        expect(after).toBeLessThan(before)
    })
})
