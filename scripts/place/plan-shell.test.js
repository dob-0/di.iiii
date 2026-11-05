// plan_shell.py: a wall plan JSON + heights -> the plain shell GLB. Guards: wall count, every wall end within 0.01 m of the
// JSON (read back from the GLB's own vertices), the GLB opens (header, JSON chunk, accessors inside the binary chunk),
// the ceiling is a separate hideable node, and no production is named in the code. Skipped when python3/numpy is missing.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(here, 'plan_shell.py')
const hasPython = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0
const run = (args) => spawnSync('python3', ['-I', '-B', script, ...args], { encoding: 'utf8' })

const PLAN = {
    walls_solid: [[[0, 0], [0, 5]], [[4, 0], [4, 5]]],
    walls_light: [[[0, 5], [4, 5.5]]],           // a slanted wall: ends must still be exact
    columns: [[2, 2, 0.5, 0.8]],
    stairs: [{ x: [0.2, 1.2], y: [0.2, 2.0] }],
    floor_rects_m: [[0, 0, 4, 5.5]]
}
const NEW = { new_walls_m: [[[1, 3], [3, 3]]] }

describe.skipIf(!hasPython)('plan_shell.py', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-shell-'))
    const plan = path.join(dir, 'plan.json'), extra = path.join(dir, 'extra.json'), out = path.join(dir, 'out')
    fs.writeFileSync(plan, JSON.stringify(PLAN)); fs.writeFileSync(extra, JSON.stringify(NEW))

    it('builds a GLB with the right counts and every wall end within 0.01 m of the JSON', () => {
        const b = run(['--plan', plan, '--new-walls', extra, '--out', out, '--height', '3', '--spawn', '2,1', '--look', '2,5'])
        expect(b.stderr).toBe('')
        expect(b.status).toBe(0)
        expect(b.stdout).toContain('4 walls, 1 columns, 1 stair blocks, 1 floor slabs')
        const c = run(['--glb', path.join(out, 'place.glb'), '--plan', plan, '--new-walls', extra])
        expect(c.stdout).toMatch(/walls 4 /)
        expect(Number(c.stdout.match(/max end error ([\d.]+) m/)[1])).toBeLessThanOrEqual(0.01)
        expect(c.status).toBe(0)
    })

    it('the GLB opens: header, JSON chunk, accessors inside the binary chunk; ceiling is a hideable node', () => {
        const buf = fs.readFileSync(path.join(out, 'place.glb'))
        expect(buf.toString('latin1', 0, 4)).toBe('glTF')
        expect(buf.readUInt32LE(8)).toBe(buf.length)
        const jl = buf.readUInt32LE(12)
        const j = JSON.parse(buf.toString('utf8', 20, 20 + jl))
        const binLen = buf.readUInt32LE(20 + jl)
        for (const v of j.bufferViews) expect(v.byteOffset + v.byteLength).toBeLessThanOrEqual(binLen)
        const names = j.nodes.map(n => n.name)
        expect(names.filter(n => n.startsWith('wall_')).length).toBe(4)
        expect(j.nodes.find(n => n.name === 'ceiling').extras.hideable).toBe(true)
        const rec = JSON.parse(fs.readFileSync(path.join(out, 'place.json'), 'utf8'))
        expect(rec.version).toBe(1)
        expect(rec.spawn.z).toBe(-1)
    })

    it('--no-ceiling leaves the ceiling out; a wall moved 0.05 m in the JSON is caught by the check', () => {
        const o2 = path.join(dir, 'out2')
        expect(run(['--plan', plan, '--out', o2, '--no-ceiling']).status).toBe(0)
        const j = JSON.parse(fs.readFileSync(path.join(o2, 'place.glb')).subarray(20).toString('utf8').split('\u0000')[0].replace(/\}[^}]*$/, '}'))
        expect(j.nodes.some(n => n.name.startsWith('ceiling'))).toBe(false)
        const moved = { ...PLAN, walls_solid: [[[0.05, 0], [0, 5]], PLAN.walls_solid[1]] }
        const pm = path.join(dir, 'moved.json'); fs.writeFileSync(pm, JSON.stringify(moved))
        expect(run(['--glb', path.join(o2, 'place.glb'), '--plan', pm]).status).toBe(1)
    })

    it('names no production', () => {
        const src = fs.readFileSync(script, 'utf8').toLowerCase()
        for (const w of ['cinema', 'moxir', 'uliana']) expect(src).not.toContain(w)
    })
})

// layer 2: a wall kind `glass`, and openings (x-range along a wall + head height) cut into any wall
const PLAN2 = {
    walls_solid: [[[0, 0], [0, 6]], [[6, 0], [6, 6]]],
    walls_light: [[[0, 6], [6, 6]]],
    walls_glass: [[[0, 0], [6, 0]]],
    floor_rects_m: [[0, 0, 6, 6]],
    openings: [
        { wall: [[0, 6], [6, 6]], x: [1, 2.5], head: 2.2 },                 // a doorway cut in the light wall
        { wall: [[0, 0], [6, 0]], x: [2.1, 3.9], head: 2.6, fill: 'glass' }  // a glass door leaf in the glass wall
    ]
}

describe.skipIf(!hasPython)('plan_shell.py layer 2: glass walls and openings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-shell2-'))
    const plan = path.join(dir, 'plan.json'), out = path.join(dir, 'out')
    fs.writeFileSync(plan, JSON.stringify(PLAN2))
    const readGlb = (p) => {
        const buf = fs.readFileSync(p); const jl = buf.readUInt32LE(12)
        const j = JSON.parse(buf.toString('utf8', 20, 20 + jl)); const bin = buf.subarray(20 + jl + 8)
        const verts = (node) => {
            const acc = j.accessors[j.meshes[node.mesh].primitives[0].attributes.POSITION], bv = j.bufferViews[acc.bufferView]
            const f = new Float32Array(bin.buffer.slice(bin.byteOffset + bv.byteOffset, bin.byteOffset + bv.byteOffset + acc.count * 12))
            const out = []; for (let i = 0; i < f.length; i += 3) out.push([f[i], f[i + 1], f[i + 2]]); return out
        }
        return { j, verts }
    }

    it('builds glass walls, header band, openings; wall ends stay exact', () => {
        const b = run(['--plan', plan, '--out', out, '--height', '3.5', '--glass-h', '2.6'])
        expect(b.stderr).toBe('')
        expect(b.status).toBe(0)
        expect(b.stdout).toContain('4 walls')
        const { j } = readGlb(path.join(out, 'place.glb'))
        const names = j.nodes.map(n => n.name)
        expect(names).toContain('wall_glass_0')
        expect(names).toContain('wall_glassheader_0')
        expect(names).toContain('opening_glass_0')
        const mat = j.materials.find(m => m.name === 'glass')
        expect(mat.alphaMode).toBe('BLEND')
        expect(mat.pbrMetallicRoughness.baseColorFactor[3]).toBeLessThan(0.6)
        const c = run(['--glb', path.join(out, 'place.glb'), '--plan', plan])
        expect(c.stdout).toMatch(/walls 4 /)
        expect(Number(c.stdout.match(/max end error ([\d.]+) m/)[1])).toBeLessThanOrEqual(0.01)
        expect(c.status).toBe(0)
    })

    it('a doorway leaves nothing between its sill and head: the wall has a lintel at the head and a gap in x', () => {
        const { j, verts } = readGlb(path.join(out, 'place.glb'))
        const v = verts(j.nodes.find(n => n.name === 'wall_light_0'))
        const topY = Math.max(...v.map(p => p[1]))
        expect(topY).toBeCloseTo(3.5, 5)
        // lintel underside at the head height, spanning exactly the opening x-range
        const under = v.filter(p => Math.abs(p[1] - 2.2) < 1e-5).map(p => p[0])
        expect(Math.min(...under)).toBeCloseTo(1, 4); expect(Math.max(...under)).toBeCloseTo(2.5, 4)
        // no vertex strictly inside the opening below the head except on the jambs
        expect(v.some(p => p[0] > 1.001 && p[0] < 2.499 && p[1] < 2.199)).toBe(false)
    })

    it('an opening outside its wall or on no wall is refused loudly', () => {
        for (const bad of [{ wall: [[0, 6], [6, 6]], x: [5, 7], head: 2 }, { wall: [[9, 9], [10, 9]], x: [0, 1], head: 2 }, { wall: [[0, 6], [6, 6]], x: [1, 2], head: 9 }]) {
            const p = path.join(dir, 'bad.json'); fs.writeFileSync(p, JSON.stringify({ ...PLAN2, openings: [bad] }))
            const r = run(['--plan', p, '--out', path.join(dir, 'outbad'), '--height', '3.5'])
            expect(r.status).not.toBe(0)
            expect(r.stderr).toMatch(/opening/)
        }
    })
})
