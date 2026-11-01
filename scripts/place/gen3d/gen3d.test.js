import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadRegistry, validateRegistry, getModel, checkModelUse, pickModel, researchOutDir, guessKind } from './registry.mjs'
import { readGlb, writeGlb, worldBounds, computeScale, scaleGlb } from './scale.mjs'
import { parseArgs, buildInvocation, sizeFor, run } from './gen3d.mjs'

const reg = loadRegistry()
const quiet = () => {}

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'gen3d-test-')) }
// A 2 x 4 x 1 box mesh (no geometry data needed: bounds come from accessor min/max), offset off the floor and the origin.
function boxGlb(file) {
    const json = {
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, translation: [10, 5, -3] }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ componentType: 5126, count: 8, type: 'VEC3', min: [-1, 0, -0.5], max: [1, 4, 0.5] }],
        buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteLength: 4 }]
    }
    fs.writeFileSync(file, writeGlb(json, Buffer.alloc(4)))
}

describe('registry', () => {
    it('loads and validates the shipped models.json (runners exist, revs pinned)', () => {
        expect(reg.models.length).toBeGreaterThanOrEqual(5)
        for (const m of reg.models) expect(m.code_rev).toMatch(/^[0-9a-f]{40}$/)
    })
    it('rejects an unpinned rev, a research_only model marked commercial, and an unknown ranking id', () => {
        const bad = structuredClone(reg)
        bad.models[0].code_rev = 'main'
        bad.models.find(m => m.research_only).commercial_ok = true
        bad.ranking.default = ['nope']
        let msg = ''
        try { validateRegistry(bad) } catch (e) { msg = e.message }
        expect(msg).toMatch(/pinned/)
        expect(msg).toMatch(/research_only cannot be commercial_ok/)
        expect(msg).toMatch(/unknown model nope/)
    })
    it('rejects a local entry without a local runner', () => {
        const bad = structuredClone(reg)
        bad.models[0].where = ['colab', 'local']
        expect(() => validateRegistry(bad)).toThrow(/no local_runner/)
    })
    it('getModel names the known ids on a typo', () => {
        expect(() => getModel(reg, 'tripo')).toThrow(/Known: triposg/)
    })
})

describe('research_only guard', () => {
    const hy = getModel(reg, 'hunyuan3d-2.1')
    it('refuses a research-only model for product, quoting the territory clause', () => {
        const g = checkModelUse(hy, { use: 'product' })
        expect(g.ok).toBe(false)
        expect(g.reason).toMatch(/RESEARCH ONLY/)
        expect(g.reason).toMatch(/European Union, United Kingdom and South Korea/)
    })
    it('allows it only as --use research, flagged', () => {
        const g = checkModelUse(hy, { use: 'research' })
        expect(g.ok).toBe(true)
        expect(g.flags.research_only).toBe(true)
    })
    it('research output dir is always suffixed, never a product path', () => {
        expect(researchOutDir('/a/b/out/')).toBe('/a/b/out-RESEARCH-ONLY')
        expect(researchOutDir('/a/out-RESEARCH-ONLY')).toBe('/a/out-RESEARCH-ONLY')
    })
    it('conditional licences need an explicit accept', () => {
        const t = getModel(reg, 'trellis-image-large')
        expect(checkModelUse(t, { use: 'product' }).ok).toBe(false)
        expect(checkModelUse(t, { use: 'product', allowConditional: true }).ok).toBe(true)
    })
    it('rejects a bad --use value', () => {
        expect(checkModelUse(getModel(reg, 'triposg'), { use: 'demo' }).ok).toBe(false)
    })
    it('the CLI refuses hunyuan for product with exit 3 and writes nothing', () => {
        const out = tmp()
        const code = run(['x.png', '--model', 'hunyuan3d-2.1', '--out', out].map((a, i) => (i === 0 ? (() => { const f = path.join(out, 'x.png'); fs.writeFileSync(f, ''); return f })() : a)), quiet)
        expect(code).toBe(3)
        expect(fs.existsSync(path.join(out, 'raw'))).toBe(false)
    })
})

describe('auto ranking (JUDGE.md)', () => {
    it('furniture -> TripoSG; thin falls through the conditional TRELLIS to TripoSG for product', () => {
        expect(pickModel(reg, { kind: 'furniture' }).model.id).toBe('triposg')
        const thin = pickModel(reg, { kind: 'thin' })
        expect(thin.model.id).toBe('triposg')
        expect(thin.skipped[0]).toMatch(/trellis-image-large/)
    })
    it('thin with --allow-conditional picks TRELLIS first, as ranked', () => {
        expect(pickModel(reg, { kind: 'thin', allowConditional: true }).model.id).toBe('trellis-image-large')
    })
    it('never auto-picks research-only or unrun models, and fails clearly for local', () => {
        for (const kind of ['furniture', 'thin', 'round', 'default']) {
            const id = pickModel(reg, { kind, allowConditional: true }).model.id
            expect(reg.never_auto).not.toContain(id)
        }
        expect(() => pickModel(reg, { kind: 'default', where: 'local' })).toThrow(/cannot run local/)
    })
    it('guesses kinds from the crop names used in the pilot', () => {
        expect(guessKind('film_camera_gantry.png')).toBe('thin')
        expect(guessKind('reel_on_pallet.png')).toBe('round')
        expect(guessKind('swivel_chair.png')).toBe('furniture')
    })
})

describe('arguments and runner calls', () => {
    it('parses sizes and flags, rejects bad ones', () => {
        const o = parseArgs(['dir', '--size', '2x4x1', '--where', 'colab', '--allow-conditional'])
        expect(o.size).toEqual([2, 4, 1])
        expect(() => parseArgs(['d', '--size', '1,2'])).toThrow(/W,H,D/)
        expect(() => parseArgs(['d', '--where', 'cloud'])).toThrow()
        expect(() => parseArgs(['d', '--bogus'])).toThrow(/unknown option/)
        expect(() => parseArgs(['d', '--model'])).toThrow(/needs a value/)
    })
    it('builds each runner call from the registry', () => {
        const a = buildInvocation(getModel(reg, 'triposg'), { inDir: '/i', outDir: '/o', gpu: 'L4' })
        expect(a.args).toEqual(['L4', '/i', '/o'])
        expect(a.env.BGREM).toBe('none')
        const b = buildInvocation(getModel(reg, 'trellis2-4b'), { inDir: '/i', outDir: '/o', gpu: 'A100' })
        expect(b.env).toEqual({ GEN3D_IN: '/i', GEN3D_OUT: '/o' })
    })
    it('the --sizes table wins over the global size', () => {
        expect(sizeFor('chair', { height: 1 }, { chair: { height_m: 0.9 } })).toEqual({ height: 0.9 })
        expect(sizeFor('other', { height: 1 }, { chair: { height_m: 0.9 } })).toEqual({ height: 1 })
        expect(sizeFor('x', {}, null)).toBeNull()
    })
    it('refuses to run without the no-people confirmation', () => {
        const d = tmp(); const f = path.join(d, 'a.png'); fs.writeFileSync(f, '')
        expect(run([f, '--out', path.join(d, 'o')], quiet)).toBe(3)
    })
    it('refuses --where local (no proven local runner)', () => {
        const d = tmp(); const f = path.join(d, 'a.png'); fs.writeFileSync(f, '')
        expect(() => run([f, '--where', 'local', '--model', 'triposg', '--no-people-confirmed'], quiet)).not.toThrow()
        expect(run([f, '--where', 'local', '--model', 'triposg', '--no-people-confirmed'], quiet)).toBe(3)
    })
})

describe('scale to measured size', () => {
    it('computes the box extent through node transforms', () => {
        const f = path.join(tmp(), 'b.glb'); boxGlb(f)
        const b = worldBounds(readGlb(fs.readFileSync(f)).json)
        expect(b.extent).toEqual([2, 4, 1])
        expect(b.min).toEqual([9, 5, -3.5])
    })
    it('scales by height to metres and seats on the floor, centred', () => {
        const d = tmp(); const f = path.join(d, 'b.glb'); boxGlb(f)
        const r = scaleGlb(f, path.join(d, 's.glb'), { height: 1.0 })
        expect(r.scale).toBeCloseTo(0.25, 6)
        const b = worldBounds(readGlb(fs.readFileSync(path.join(d, 's.glb'))).json)
        expect(b.extent[1]).toBeCloseTo(1.0, 6)
        expect(b.min[1]).toBeCloseTo(0, 6)
        expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 6)
    })
    it('box fit uses the smallest ratio and reports the residual per axis', () => {
        const d = tmp(); const f = path.join(d, 'b.glb'); boxGlb(f)
        const r = scaleGlb(f, path.join(d, 's.glb'), { size: [1, 1, 1] })   // ratios .5, .25, 1 -> .25
        expect(r.scale).toBeCloseTo(0.25, 6)
        expect(r.residual_vs_target).toEqual([0.5, 1, 0.25])
    })
    it('rejects non-positive targets and non-GLB input', () => {
        expect(() => computeScale([1, 1, 1], { height: 0 })).toThrow()
        expect(() => computeScale([1, 1, 1], { size: [1, 2] })).toThrow()
        expect(() => readGlb(Buffer.from('not a glb at all, sorry'))).toThrow(/magic/)
    })
    it('keeps the BIN chunk intact', () => {
        const d = tmp(); const f = path.join(d, 'b.glb'); boxGlb(f)
        scaleGlb(f, path.join(d, 's.glb'), { height: 2 })
        expect(readGlb(fs.readFileSync(path.join(d, 's.glb'))).bin.length).toBe(4)
    })
})
