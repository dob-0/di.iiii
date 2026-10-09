import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

import { fixturesGlb, readGeometry } from './fixtures-glb.mjs'
import { aimFixture } from './fixture-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, 'fixtures')
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures.json'), 'utf8'))
const builder = fs.readFileSync(path.join(dir, 'build_fixtures.py'))

describe('the fixtures manifest', () => {
    it('gives every number a source it lists, or says it is an assumption', () => {
        for (const [kind, entry] of Object.entries(manifest.kinds)) {
            // UP- is the rental house's own code; EXT- a planning type for a line from another
            // supplier (strobe, blinder, hazer: the rental list has none — RIG_BUILD.md §15).
            expect(entry.code, kind).toMatch(/^(UP|EXT)-/)
            if (entry.code.startsWith('EXT-')) expect(entry.identified, kind).toMatch(/another supplier/)
            for (const [field, spec] of Object.entries(entry.specs)) {
                expect(['EXACT', 'COMPONENT', 'EQUIVALENT', 'TESTED', 'UNKNOWN', 'ASSUMED'], `${kind}.${field}`).toContain(spec.basis)
                // UNKNOWN: looked for and not found — it holds no number and cites nothing
                if (spec.basis === 'UNKNOWN') { expect(spec.value, `${kind}.${field}`).toBeNull(); expect(spec.note, `${kind}.${field}`).toBeTruthy(); continue }
                if (spec.basis === 'ASSUMED') continue
                for (const src of String(spec.src).split(/,\s*/)) expect(manifest.sources[src], `${kind}.${field} cites ${src}`).toBeTruthy()
            }
            for (const src of String(entry.photometry?.src || '').split(/,\s*/).filter(Boolean)) {
                expect(manifest.photometrySources?.[src] || manifest.sources[src], `${kind}.photometry cites ${src}`).toBeTruthy()
            }
        }
        // A source is a page, or (TESTED) the rental unit itself, which has no page: it says so.
        for (const [id, s] of Object.entries(manifest.sources)) {
            if (s.url === null) expect(s.what, id).toMatch(/rental units? themselves/)
            else expect(s.url, id).toMatch(/^https:\/\//)
        }
    })

    it('carries the Sevan-kit research of 2026-10-09: each number labelled, the open conflict kept open', () => {
        const { beam380, par, smoke, lasercube } = manifest.kinds
        // the B380F's two TESTED channel maps disagree from ch11: written down as OPEN, not resolved by choice
        expect(beam380.specs.dmx_order.basis).toBe('TESTED')
        expect(beam380.specs.dmx_order.open).toMatch(/^OPEN/)
        expect(beam380.specs.dmx_order.open).toMatch(/ch11-16/)
        expect(beam380.specs.lamp_component.basis).toBe('COMPONENT')
        expect(beam380.specs.lamp_component.value.flux_lm).toBe(20000)
        expect(beam380.specs.field_deg.basis).toBe('UNKNOWN')
        expect(par.specs.field_deg.basis).toBe('UNKNOWN')
        expect(par.specs.dmx_order.basis).toBe('TESTED')
        // the one haze source: its output volume is not published, and is never copied from a reseller
        expect(smoke.specs.output_m3_min.basis).toBe('UNKNOWN')
        expect(smoke.specs.fluid_ml_per_min.value).toBe(150)
        // the owner's cubes: the 6.0 W variant, per diode, from the maker's Guide v1.2
        expect(lasercube.specs.variant_in_use.value).toMatchObject({ '455nm': 2700, '525nm': 1500, '638nm': 1800 })
    })

    it('says what licence the models are under and that they are not the makers\' CAD', () => {
        expect(manifest.modelsLicence.licence).toMatch(/AGPL-3\.0/)
        expect(manifest.search.gdtf).toMatch(/account/)
    })
})

describe('the built models', () => {
    for (const kind of Object.keys(manifest.kinds)) {
        it(`${kind}: was built by the current build_fixtures.py, with its parts and pivots recorded`, () => {
            const geo = readGeometry(kind)
            // A GLB built by an older script is stale: rebuild in Blender.
            expect(geo.scriptSha256).toBe(crypto.createHash('sha256').update(builder).digest('hex'))
            expect(fs.existsSync(path.join(dir, 'glb', `${kind}.glb`))).toBe(true)
            expect(geo.parts.length).toBeGreaterThan(0)
            expect(geo.triangles.total).toBeLessThan(1500)
            // Within 10 % of the published size on every axis.
            for (const d of geo.deviationFromDatasheet_pct) expect(Math.abs(d), `${kind} ${geo.deviationFromDatasheet_pct}`).toBeLessThanOrEqual(10)
        })
    }

    it('keeps the pivots where the GLB\'s nodes are: the Yoke on the pan axis, the Head on the tilt axis', async () => {
        const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
        const geo = readGeometry('beam380')
        const doc = await io.read(path.join(dir, 'glb', 'beam380.glb'))
        const world = (name) => doc.getRoot().listNodes().find((n) => n.getName() === name).getWorldTranslation()
        expect(world('Yoke')[1]).toBeCloseTo(geo.panY, 3)
        expect(world('Head')[1]).toBeCloseTo(geo.tiltY, 3)
        expect(world('Head')[0]).toBeCloseTo(0, 6)
    })
})

describe('the rig\'s fixture bodies as one instanced GLB', () => {
    it('writes one instanced node per part per kind, one instance per fixture, lenses tinted per lamp', async () => {
        const geo = readGeometry('beam380')
        const par = readGeometry('par')
        const fixtures = [
            { kind: 'beam380', colour: '#ff0000', ...aimFixture(geo, { pos: [1, 0, 0] }, { target: [3, 10, 0] }) },
            { kind: 'beam380', colour: '#00ff00', ...aimFixture(geo, { pos: [-1, 0, 0] }, { target: [-3, 10, 0] }) },
            { kind: 'par', colour: '#0000ff', ...aimFixture(par, { pos: [0, 6, 0], orient: 'hung' }, { target: [0, 0, 2] }) }
        ]
        const bytes = await fixturesGlb(fixtures)
        const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes)
        const nodes = doc.getRoot().listNodes()
        expect(nodes.map((n) => n.getName()).sort()).toEqual([...geo.parts.map((p) => `beam380.${p}`), ...par.parts.map((p) => `par.${p}`)].sort())
        const lens = nodes.find((n) => n.getName() === 'beam380.Lens').getExtension('EXT_mesh_gpu_instancing')
        expect(lens.getAttribute('TRANSLATION').getCount()).toBe(2)
        expect(Array.from(lens.getAttribute('_COLOR_0').getElement(0, []))).toEqual([1, 0, 0])
        expect(doc.getRoot().listExtensionsRequired().map((e) => e.extensionName)).toContain('EXT_mesh_gpu_instancing')
        // One Body, one Lens … material for the whole rig, not one per kind.
        const names = doc.getRoot().listMaterials().map((m) => m.getName())
        expect(names.length).toBe(new Set(names).size)
    })
})
