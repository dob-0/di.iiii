// clipToField: what leaves the field is blanked, never pressed onto its edge (review of PR #1071, finding 1).
import { describe, expect, it } from 'vitest'
import { clipToField } from './clipField.js'

const verts = (paths) => paths.flatMap((path) => {
    const out = []
    for (let i = 0; i < path.p.length; i += 5) out.push([path.p[i], path.p[i + 1]])
    return out
})

describe('clipToField', () => {
    it('returns a path wholly inside as it is', () => {
        const path = { p: [0, 0, 1, 0, 0, 0.5, 0.5, 1, 0, 0], closed: false }
        const out = clipToField([path])
        expect(out.paths[0]).toBe(path)
        expect(out.outside).toBe(0)
    })

    it('cuts a line where it leaves the field and drops what is past it', () => {
        const out = clipToField([{ p: [0, 0, 1, 0, 0, 2, 0, 0, 1, 0], closed: false }])
        expect(out.outside).toBe(1)
        expect(out.paths).toHaveLength(1)
        expect(out.paths[0].p.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 1, 0, 0, 1, 0, 0.5, 0.5, 0])
    })

    it('keeps the part of a segment whose two ends are both outside', () => {
        const out = clipToField([{ p: [-3, 0, 1, 1, 1, 3, 0, 1, 1, 1], closed: false }])
        expect(verts(out.paths)).toEqual([[-1, 0], [1, 0]])
    })

    it('drops a line wholly outside and a dot outside; makes no dot from a corner graze', () => {
        expect(clipToField([{ p: [0, 2, 1, 1, 1, 1, 3, 1, 1, 1], closed: false }]).paths).toEqual([])
        expect(clipToField([{ p: [2, 2, 1, 1, 1], closed: false }]).paths).toEqual([])
        // touches the field only at the corner (1, 1)
        expect(clipToField([{ p: [0, 2, 1, 1, 1, 2, 0, 1, 1, 1], closed: false }]).paths).toEqual([])
    })

    it('a closed circle too big for the field becomes its arcs inside, joined across its start', () => {
        const n = 400; const r = 1.2; const p = []
        // starts at 45°, inside the field: 4 arcs survive (one by each corner), the one it starts in joined
        for (let i = 0; i < n; i += 1) {
            const a = Math.PI / 4 + (2 * Math.PI * i) / n
            p.push(r * Math.cos(a), r * Math.sin(a), 1, 0, 0)
        }
        const out = clipToField([{ p, closed: true }])
        expect(out.paths).toHaveLength(4)
        expect(out.paths.every((path) => !path.closed)).toBe(true)
        const all = verts(out.paths)
        expect(all.every(([x, y]) => Math.abs(x) <= 1 && Math.abs(y) <= 1)).toBe(true)
        expect(all.filter(([x, y]) => Math.abs(x) === 1 && Math.abs(y) === 1)).toHaveLength(0)
        // every vertex kept lies on the circle: no line the file did not have
        expect(all.every(([x, y]) => Math.abs(Math.hypot(x, y) - r) < 0.01)).toBe(true)
    })
})
