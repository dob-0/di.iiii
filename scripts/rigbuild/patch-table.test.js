// @vitest-environment node
// patch-table.mjs: the crew's short patch table, from the MOXIR v2 patch plan alone.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../place/common.mjs'
import { loadLibrary } from './library.mjs'
import { renderHtml, renderMarkdown, tableModel } from './patch-table.mjs'

const planFile = 'scripts/place/rigs/moxir-v2-patch-2026-10-09.json'
const plan = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, planFile), 'utf8'))
const library = loadLibrary()
const model = () => tableModel({ plan, library, planFile })

describe('the crew table of the MOXIR v2 patch', () => {
    it('has one row per block: universe, start address, fixture, mode — and the cubes as LAN, not DMX', () => {
        const md = renderMarkdown(model())
        const table = md.split('\n').filter((l) => /^\| (U\d|LAN) /.test(l) && l.split('|').length === 9)
        expect(table.map((l) => l.split('|').slice(1, 5).map((c) => c.trim()).join(' · '))).toEqual([
            'U1 · 001 · UP-B380F beam · 16 ch',
            'U1 · 401 · UP-LA40WF laser (Poligraf 40 W) · 32 ch',
            'U1 · 501 · UP-YZ31P smoke machine · 1 ch (ASSUMED)',
            'U2 · 001 · UP-PL5403 wash, the cut · 8 ch',
            'U2 · 101 · UP-PL5403 wash, the planes · 8 ch',
            'LAN · — · 6 × LaserCube Ultra MK2 7.5 W (the owner\'s, from hosq) · not DMX'
        ])
        expect(md).toMatch(/\*\*U1\*\* 353 of 512 channels used, 159 free \(21 devices\)/)
        expect(md).toMatch(/\*\*U2\*\* 400 of 512 channels used, 112 free \(50 devices\)/)
        expect(md).toMatch(/\*\*LaserCubes:\*\* LAN only, through di Nodes/)
        expect(md).toMatch(/channels 11–16 disagree with the equivalent chart/)
        expect(md).toContain('no universe, no address')
    })

    it('lists every unit once, at the address the planner gave it', () => {
        const m = model()
        expect(m.rows).toHaveLength(71)
        const md = renderMarkdown(m)
        expect(md).toMatch(/\| 101 \| 1\.001 \| 016 \| UP-B380F beam \| 1 \| 16 ch \|/)
        expect(md).toMatch(/\| 118 \| 1\.273 \| 288 \| UP-B380F beam \| 18 \| 16 ch \|/)
        expect(md).toMatch(/\| 132 \| 1\.433 \| 464 \| UP-LA40WF laser \(Poligraf 40 W\) \| 2 \| 32 ch \|/)
        expect(md).toMatch(/\| 141 \| 1\.501 \| 501 \| UP-YZ31P smoke machine \| 1 \| 1 ch \(ASSUMED\) \|/)
        expect(md).toMatch(/\| 260 \| 2\.413 \| 420 \| UP-PL5403 wash, the planes \| 40 \| 8 ch \|/)
        // no address twice in a universe
        const seen = new Set(m.rows.map((r) => `${r.universe}.${r.address}`))
        expect(seen.size).toBe(71)
    })

    it('says how many more units each block takes, and that U2 needs two DMX lines', () => {
        const m = model()
        const rooms = m.universes.flatMap((u) => u.blocks.map((b) => b.room.units))
        expect(rooms).toEqual([7, 1, 11, 2, 11])
        expect(m.universes.map((u) => u.lines)).toEqual([1, 2])
        expect(m.notes.join('\n')).toMatch(/U1 has 21 devices, so one line; U2 has 50 devices, so at least 2 lines/)
        expect(m.notes.join('\n')).toMatch(/UP-YZ31P: the channel count \(1\) is ASSUMED.*502–512 are free/)
    })

    it('prints an HTML page with the same table, and refuses a plan that does not fit', () => {
        const html = renderHtml(model())
        expect(html).toContain('<h2>The patch</h2>')
        expect(html.match(/<tr>/g).length).toBeGreaterThan(70)
        expect(html).not.toMatch(/undefined|NaN/)
        const broken = structuredClone(plan)
        broken.universes[0].blocks[1].start = 281 // inside the last beam
        expect(() => tableModel({ plan: broken, library })).toThrow(/overlaps/)
    })

    it('runs from the command line: --out writes the Markdown, the page and the CSV', async () => {
        const { spawnSync } = await import('node:child_process')
        const out = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-table-'))
        try {
            const run = spawnSync('node', ['scripts/rigbuild/patch-table.mjs', '--plan', planFile, '--out', out], { cwd: REPO_ROOT, encoding: 'utf8' })
            expect(run.status, run.stderr).toBe(0)
            expect(fs.readdirSync(out).sort()).toEqual(['patch-sheet.html', 'patch-sheet.md', 'patch.csv'])
            const csv = fs.readFileSync(path.join(out, 'patch.csv'), 'utf8').trim().split('\r\n')
            expect(csv).toHaveLength(72) // the header and 71 units
            expect(csv[0]).toBe('universe,address,last,fixture #,fixture,type,unit,mode,channels,channel list')
        } finally {
            fs.rmSync(out, { recursive: true, force: true })
        }
    })
})

describe('a plan that brings its own types (Platina, 2026-11-10)', () => {
    const file = 'scripts/place/rigs/platina-2026-11-10.patch.json'
    const own = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))
    const m = () => tableModel({ plan: own, library, planFile: file })

    it('gives all 50 units of the plot an address, none overlapping, none past 512', () => {
        const rows = m().rows
        expect(rows).toHaveLength(50)
        expect(rows.filter((r) => r.type === 'cp-aleda-beye-k10')).toHaveLength(11)
        expect(rows.filter((r) => r.type === 'cp-sharpy')).toHaveLength(7)
        expect(rows.filter((r) => r.type === 'cp-hy-beye-k15')).toHaveLength(8)
        expect(rows.filter((r) => r.type === 'acme-pixel-line-ip')).toHaveLength(24)
        const taken = new Set()
        for (const r of rows) {
            expect(r.address + r.footprint - 1).toBeLessThanOrEqual(512)
            for (let c = r.address; c < r.address + r.footprint; c++) {
                const key = `${r.universe}.${c}`
                expect(taken.has(key), key).toBe(false)
                taken.add(key)
            }
        }
        expect(new Set(rows.map((r) => r.index)).size).toBe(50)
    })

    it('keeps each unit one LARGER mode apart, so a mode change on the night moves no address', () => {
        const blocks = m().universes.flatMap((u) => u.blocks)
        expect(blocks.map((b) => `${b.code} ${b.footprint}/${b.pitch}`)).toEqual([
            'A.leda B-EYE K10 21/35', 'A.leda B-EYE K10 21/35', 'Sharpy 16/20', 'HY B-EYE K15 22/36', 'HY B-EYE K15 22/36', 'Pixel Line IP 7/21'
        ])
        const md = renderMarkdown(m())
        expect(md).toContain('| U1 | 001 | B-EYE K10, over-stage truss (A.leda B-EYE K10) | Standard, 21 ch | 8 | 001, 036 … 246 (last ch 266) |')
        expect(md).toContain('PROPOSED, not yet confirmed by the Platina side')
        expect(md).not.toContain('the cubes on the LAN')
        expect(md.split('A.leda B-EYE K10: the units stand')).toHaveLength(2)
    })

    it('says the channel list is owed, and refuses a plan type that hides where its count comes from', () => {
        expect(m().notes.filter((n) => /channel LIST is owed/.test(n))).toHaveLength(4)
        const bad = structuredClone(own)
        delete bad.types[0].modes[0].src
        expect(() => tableModel({ plan: bad, library })).toThrow(/does not say where its channel count comes from/)
        const twice = structuredClone(own)
        twice.types[0].id = library.types[0].id
        expect(() => tableModel({ plan: twice, library })).toThrow(/already in the library/)
    })
})
