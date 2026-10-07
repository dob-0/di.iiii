import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'hall-textures.json'), 'utf8'))
const hallPy = fs.readFileSync(path.join(here, 'hall.py'), 'utf8')
const materials = [...hallPy.match(/^MATERIALS = \{([\s\S]*?)^\}/m)[1].matchAll(/^ {4}'([a-z-]+)':/gm)].map((m) => m[1])

describe('hall texture manifest (provenance and pins)', () => {
    it('names its licence, source and retrieval date', () => {
        expect(manifest.licence).toMatch(/CC0 1\.0/)
        expect(manifest.source).toBe('https://ambientcg.com')
        expect(manifest.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
    it('pins every set by sha256 and gives it a tile size', () => {
        for (const [id, set] of Object.entries(manifest.sets)) {
            expect(set.sha256, id).toMatch(/^[0-9a-f]{64}$/)
            expect(set.url, id).toContain(`file=${id}_1K-JPG.zip`)
            expect(set.tile_m, id).toBeGreaterThan(0)
        }
    })
    it('only textures materials that hall.py has, each once', () => {
        const used = Object.values(manifest.sets).flatMap((s) => s.for)
        for (const m of used) expect(materials, m).toContain(m)
        expect(new Set(used).size).toBe(used.length)
    })
})
