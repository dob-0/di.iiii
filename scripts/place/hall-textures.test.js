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

describe('hall texture bake: one copy of each map per set', () => {
    const bake = fs.readFileSync(path.join(here, 'hall-textures.py'), 'utf8')
    it('writes maps by set id, never by material', () => {
        expect(bake).toMatch(/\{sid\}_color\.jpg/)
        expect(bake).toMatch(/\{sid\}_normal\.jpg/)
        expect(bake).toMatch(/\{sid\}_rough\.jpg/)
        expect(bake).not.toMatch(/\{mat\}_(color|normal)/)
    })
    it('hall.py loads each set image once and exports tint and roughness as glTF factors', () => {
        expect(hallPy).toContain('check_existing=True')
        expect(hallPy).toContain("'RGBA', 'MULTIPLY'")
        expect(hallPy).toContain("spec['roughness_factor']")
        expect(hallPy).toContain("export_image_format='JPEG'")
    })
    const cache = path.join(process.env.HOME || '', '.cache/di-hall-textures')
    const cached = Object.keys(manifest.sets).every((id) => fs.existsSync(path.join(cache, `${id}.zip`)))
    it.skipIf(!cached)('bakes factors <= 1 whose product reproduces each table colour and roughness', async () => {
        const { execFileSync } = await import('node:child_process')
        const out = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'hall-bake-'))
        execFileSync('python3', [path.join(here, 'hall-textures.py'), '--out', out], { stdio: 'pipe' })
        const t = JSON.parse(fs.readFileSync(path.join(out, 'textures.json'), 'utf8'))
        for (const [id, set] of Object.entries(manifest.sets)) {
            for (const f of ['color', 'normal', 'rough']) expect(fs.existsSync(path.join(out, `${id}_${f}.jpg`)), `${id} ${f}`).toBe(true)
            for (const m of set.for) {
                expect(t.materials[m].set).toBe(id)
                expect(Math.max(...t.materials[m].tint)).toBeLessThanOrEqual(1)
                expect(t.materials[m].roughness_factor).toBeLessThanOrEqual(1)
            }
        }
        expect(fs.readdirSync(out).filter((f) => f.endsWith('.jpg')).length).toBe(3 * Object.keys(manifest.sets).length)
        fs.rmSync(out, { recursive: true })
    })
})
